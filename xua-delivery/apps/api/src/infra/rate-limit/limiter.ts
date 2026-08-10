import redis, { ensureConnected } from "../redis/client";

const RATE_LIMIT_PREFIX = "rl:";

interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Rate limiter baseado em Redis (sliding window counter).
 * Retorna { allowed, remaining, retryAfterSeconds }.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  await ensureConnected();
  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;
  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, config.windowSeconds);
  }

  const remaining = Math.max(config.maxRequests - current, 0);
  const allowed = current <= config.maxRequests;
  const ttl = await redis.ttl(redisKey);

  return {
    allowed,
    remaining,
    retryAfterSeconds: allowed ? 0 : Math.max(ttl, 1),
  };
}

// ─── Categorias reutilizáveis ────────────────────────────────────────────────
//
// Aplique uma destas por padrão em qualquer rota nova. Só crie um override
// nomeado abaixo (como paymentCharge, catalogRead, orderCreate) quando o
// custo REAL daquela rota específica justificar um limiar diferente da
// categoria — não crie uma entrada nova por rota por hábito.
//
// Antes desta reestruturação, cada rota que precisava de limite ganhava uma
// config isolada (ex: zoneCoverageBulk) mesmo quando o padrão de risco já
// existia em outro lugar — o que significava reinventar a config a cada
// módulo novo em vez de reusar. Isso também deixava óbvio, por omissão, quais
// rotas nunca tiveram rate limit aplicado (a maioria — ver auditoria de
// 09/08/2026 em 04-active-state.md).
const RATE_LIMIT_CATEGORIES = {
  /** Leitura pública, sem autenticação (ex: catálogo, distribuidoras públicas). */
  publicRead: { windowSeconds: 60, maxRequests: 60 },
  /** Leitura autenticada padrão, sem custo de query fora do comum. */
  authenticatedRead: { windowSeconds: 60, maxRequests: 120 },
  /** Escrita/mutação autenticada padrão (CRUD comum). */
  authenticatedWrite: { windowSeconds: 60, maxRequests: 30 },
  /** Ações de segurança/autenticação — login, registro, troca de credencial. */
  sensitiveAction: { windowSeconds: 60, maxRequests: 10 },
  /** Import em massa ou mutação com múltiplas queries pesadas por request. */
  bulkImport: { windowSeconds: 60, maxRequests: 20 },
  /** Leitura cara (export, relatório) — não é mutação, mas custa como uma. */
  heavyRead: { windowSeconds: 60, maxRequests: 20 },
  /** Chamada que depende de serviço de terceiro (ex: lookup de CEP). */
  externalLookup: { windowSeconds: 60, maxRequests: 30 },
} as const;

// ─── Overrides nomeados — tuning específico por domínio ────────────────────
export const RATE_LIMITS = {
  ...RATE_LIMIT_CATEGORIES,
  auth: { windowSeconds: 60, maxRequests: 10 },
  // Esqueci a senha — janela larga e limite baixo para evitar abuso/e-mail bombing.
  passwordReset: { windowSeconds: 900, maxRequests: 5 },
  orders: { windowSeconds: 60, maxRequests: 30 },
  orderRating: { windowSeconds: 60, maxRequests: 5 },
  orderCreate: { windowSeconds: 60, maxRequests: 10 },
  orderDriverAction: { windowSeconds: 60, maxRequests: 20 },
  catalogRead: { windowSeconds: 60, maxRequests: 120 },
  paymentCharge: {
    windowSeconds: numberFromEnv("PAYMENT_CHARGE_RATE_LIMIT_WINDOW_SECONDS", 60),
    maxRequests: numberFromEnv("PAYMENT_CHARGE_RATE_LIMIT_MAX", 12),
  },
  paymentStatus: {
    windowSeconds: numberFromEnv("PAYMENT_STATUS_RATE_LIMIT_WINDOW_SECONDS", 60),
    maxRequests: numberFromEnv("PAYMENT_STATUS_RATE_LIMIT_MAX", 120),
  },
  paymentWebhook: {
    windowSeconds: numberFromEnv("PAYMENT_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS", 60),
    maxRequests: numberFromEnv("PAYMENT_WEBHOOK_RATE_LIMIT_MAX", 600),
  },
} as const;
