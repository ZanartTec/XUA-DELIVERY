import { z } from "zod";

/**
 * Validação central do ambiente.
 *
 * Antes disso cada módulo lia `process.env.X` por conta própria e, no pior caso,
 * só descobria que a variável faltava no primeiro request que a usasse — em
 * produção, possivelmente semanas depois do deploy. `loadEnv()` roda no boot do
 * server e do worker e derruba o processo listando TODOS os problemas de uma vez.
 *
 * Os leitores individuais (jwt.ts, secret-cipher.ts, otp.service.ts, ...)
 * continuam lendo process.env sob demanda de propósito: eles têm regras e testes
 * próprios. Este schema é a rede de segurança de boot, não um substituto deles —
 * por isso replica as mesmas regras (ver comentários em cada campo).
 */

const PLACEHOLDER_JWT_SECRET = "troque-por-uma-chave-segura";

/** Aceita "1", "true", "yes", "on" (case-insensitive) como verdadeiro. */
const booleanish = z
  .string()
  .transform((value) => ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));

/** Inteiro positivo vindo de string de ambiente. */
const positiveInt = z
  .string()
  .trim()
  .regex(/^\d+$/, "deve ser um número inteiro positivo")
  .transform(Number)
  .refine((value) => value > 0, "deve ser maior que zero");

const url = z.string().trim().url("deve ser uma URL válida");

const envSchema = z.object({
  // ─── Ambiente ────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: positiveInt.optional(),
  HOST: z.string().trim().min(1).optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),

  // ─── Persistência ────────────────────────────────────────────────
  DATABASE_URL: z.string().trim().min(1, "não definido"),

  // getRedisUrl() usa CACHE_REDIS_URL/QUEUE_REDIS_URL com fallback em REDIS_URL.
  // A exigência real está no superRefine abaixo.
  REDIS_URL: url.optional(),
  CACHE_REDIS_URL: url.optional(),
  QUEUE_REDIS_URL: url.optional(),
  REDIS_KEY_PREFIX: z.string().trim().min(1).optional(),
  QUEUE_PREFIX: z.string().trim().min(1).optional(),

  // ─── Segurança ───────────────────────────────────────────────────
  // Mesmas regras de infra/auth/jwt.ts (validateJwtSecret).
  JWT_SECRET: z
    .string()
    .trim()
    .min(32, "use pelo menos 32 caracteres aleatórios")
    .refine(
      (value) => !value.toLowerCase().includes(PLACEHOLDER_JWT_SECRET),
      "está com valor placeholder — configure um segredo real"
    ),
  // Mesmo formato de infra/crypto/secret-cipher.ts (parseMasterKey):
  // 32 bytes em hex (64 chars) ou base64.
  ENCRYPTION_MASTER_KEY: z
    .string()
    .trim()
    .refine(isValidMasterKey, "deve ter 32 bytes (hex de 64 chars ou base64)")
    .optional(),
  OTP_SECRET: z.string().trim().min(1).optional(),
  PASSWORD_RESET_SECRET: z.string().trim().min(1).optional(),
  INTERNAL_SECRET: z.string().trim().min(1).optional(),
  PAYMENT_WEBHOOK_CONTEXT_SECRET: z.string().trim().min(1).optional(),
  DUMMY_HASH: z.string().trim().min(1).optional(),

  // ─── CORS / origens ──────────────────────────────────────────────
  APP_ORIGIN: z.string().trim().min(1).optional(),
  APP_ALLOWED_ORIGINS: z.string().trim().min(1).optional(),
  RENDER_EXTERNAL_URL: url.optional(),

  // ─── E-mail ──────────────────────────────────────────────────────
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  MAIL_FROM: z.string().trim().min(1).optional(),

  // ─── Pagamentos ──────────────────────────────────────────────────
  // As credenciais do gateway são por distribuidora (cifradas no banco);
  // aqui ficam apenas as configurações operacionais do adapter.
  PAYMENT_PROVIDER: z.string().trim().min(1).optional(),
  PAYMENT_EXPIRATION_MINUTES: positiveInt.optional(),
  MERCADOPAGO_API_BASE_URL: url.optional(),
  MERCADOPAGO_NOTIFICATION_URL: url.optional(),
  MERCADOPAGO_NOTIFICATION_SOURCE: z.string().trim().min(1).optional(),
  MERCADOPAGO_REQUEST_TIMEOUT_MS: positiveInt.optional(),
  MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS: positiveInt.optional(),
  MERCADOPAGO_STATEMENT_DESCRIPTOR: z.string().trim().min(1).optional(),
  MERCADOPAGO_BACK_URL_SUCCESS: url.optional(),
  MERCADOPAGO_BACK_URL_FAILURE: url.optional(),
  MERCADOPAGO_BACK_URL_PENDING: url.optional(),

  // ─── Push (VAPID) ────────────────────────────────────────────────
  VAPID_PUBLIC_KEY: z.string().trim().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().trim().min(1).optional(),
  VAPID_EMAIL: z.string().trim().min(1).optional(),

  // ─── Worker ──────────────────────────────────────────────────────
  INTERNAL_JOBS_WORKER_CONCURRENCY: positiveInt.optional(),
  PAYMENT_WEBHOOK_WORKER_CONCURRENCY: positiveInt.optional(),
  PAYMENTS_WORKER_CONCURRENCY: positiveInt.optional(),
  PAYMENT_REFUNDS_WORKER_CONCURRENCY: positiveInt.optional(),
  SUBSCRIPTION_EXPIRATION_WORKER_CONCURRENCY: positiveInt.optional(),

  // ─── Rollout BullMQ ──────────────────────────────────────────────
  USE_BULLMQ_OTP_CLEANUP: booleanish.optional(),
  USE_BULLMQ_SUBSCRIPTION: booleanish.optional(),
  USE_BULLMQ_SUBSCRIPTION_EXPIRY: booleanish.optional(),
});

/**
 * Variáveis sem as quais a aplicação até sobe, mas opera quebrada em produção —
 * cada uma tem hoje um `throw` tardio ou um fallback inseguro no código.
 */
const REQUIRED_IN_PRODUCTION = [
  ["ENCRYPTION_MASTER_KEY", "credenciais de gateway por distribuidora não podem ser decifradas"],
  ["OTP_SECRET", "otp.service lança FATAL ao gerar o primeiro código de entrega"],
  ["PASSWORD_RESET_SECRET", "password-reset.service lança FATAL no primeiro 'esqueci a senha'"],
  ["INTERNAL_SECRET", "a rota /api/auth/check-blacklist usada pelo middleware do Next fica aberta"],
  ["DUMMY_HASH", "a mitigação de timing attack no login deixa de funcionar"],
  ["APP_ORIGIN", "o CORS cai no fallback http://localhost:3000"],
] as const satisfies ReadonlyArray<readonly [keyof RawEnv, string]>;

/** Ausências que degradam funcionalidade em produção sem justificar derrubar o boot. */
const WARN_IN_PRODUCTION = [
  ["RESEND_API_KEY", "envio de e-mail fica desabilitado (mailer em modo stub)"],
  ["VAPID_PUBLIC_KEY", "push notifications ficam desabilitadas"],
  ["VAPID_PRIVATE_KEY", "push notifications ficam desabilitadas"],
] as const satisfies ReadonlyArray<readonly [keyof RawEnv, string]>;

type RawEnv = z.input<typeof envSchema>;
export type Env = z.infer<typeof envSchema>;

function isValidMasterKey(raw: string): boolean {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return true;
  try {
    return Buffer.from(raw, "base64").length === 32;
  } catch {
    return false;
  }
}

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      [
        "FATAL: configuração de ambiente inválida — corrija antes de iniciar:",
        ...issues.map((issue) => `  • ${issue}`),
      ].join("\n")
    );
    this.name = "EnvValidationError";
  }
}

export interface LoadEnvResult {
  env: Env;
  warnings: string[];
}

/**
 * Valida o ambiente inteiro de uma vez. Lança EnvValidationError listando todos
 * os problemas encontrados — nunca só o primeiro.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): LoadEnvResult {
  // Strings vazias no ambiente equivalem a "não definido" (Render/Docker exportam
  // variáveis vazias quando o valor não foi preenchido).
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim() !== "") cleaned[key] = value;
  }

  const parsed = envSchema.safeParse(cleaned);
  const issues: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "(ambiente)";
      // "expected string, received undefined" é ruído para quem está
      // configurando o deploy — o que importa é que a variável não está lá.
      const message =
        issue.code === "invalid_type" && !(key in cleaned) ? "não definido" : issue.message;
      issues.push(`${key}: ${message}`);
    }
  }

  const isProduction = (cleaned.NODE_ENV ?? "development") === "production";

  // Redis: getRedisUrl("cache"/"queue") aceita override específico OU o global.
  if (!cleaned.REDIS_URL && !(cleaned.CACHE_REDIS_URL && cleaned.QUEUE_REDIS_URL)) {
    issues.push(
      "REDIS_URL: não definido (ou defina CACHE_REDIS_URL e QUEUE_REDIS_URL separadamente)"
    );
  }

  if (isProduction) {
    for (const [key, consequence] of REQUIRED_IN_PRODUCTION) {
      if (!cleaned[key]) issues.push(`${key}: obrigatório em produção — sem ele, ${consequence}`);
    }
  }

  if (issues.length > 0) throw new EnvValidationError(issues);

  const warnings: string[] = [];
  if (isProduction) {
    for (const [key, consequence] of WARN_IN_PRODUCTION) {
      if (!cleaned[key]) warnings.push(`${key} ausente em produção — ${consequence}`);
    }
  }

  // parsed.success é garantido aqui: qualquer falha do schema já entrou em issues.
  return { env: (parsed as { data: Env }).data, warnings };
}

let cached: Env | null = null;

/**
 * Valida e memoiza o ambiente. Chamado no boot do server e do worker (antes de
 * qualquer outro import com efeito colateral) e disponível para código novo que
 * precise ler configuração de forma tipada, em vez de tocar process.env direto.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): LoadEnvResult {
  const result = validateEnv(source);
  cached = result.env;
  return result;
}

export function getEnv(): Env {
  if (!cached) cached = validateEnv().env;
  return cached;
}

/** Only for tests. */
export function resetEnvCache(): void {
  cached = null;
}
