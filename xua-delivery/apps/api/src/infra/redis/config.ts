import { logger } from "../logger";

type RedisPurpose = "cache" | "queue" | "default";

const ENV = process.env.NODE_ENV ?? "development";
const DEFAULT_PREFIX = `xua:${ENV}`;

export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? DEFAULT_PREFIX;

// Garante um único log de boot por finalidade (cache/queue/default).
const loggedPurposes = new Set<RedisPurpose>();

/**
 * Extrai apenas host:port da URL para logging.
 * NUNCA loga credenciais (usuário/senha embutidos na URL).
 */
function describeRedisHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "6379"}`;
  } catch {
    return "url-invalida";
  }
}

export function getRedisUrl(purpose: RedisPurpose = "default"): string {
  const dedicatedEnvName =
    purpose === "cache"
      ? "CACHE_REDIS_URL"
      : purpose === "queue"
        ? "QUEUE_REDIS_URL"
        : null;

  const dedicatedUrl = dedicatedEnvName
    ? process.env[dedicatedEnvName]
    : undefined;
  const url = dedicatedUrl ?? process.env.REDIS_URL;

  if (!url) {
    const envName = dedicatedEnvName
      ? `${dedicatedEnvName} ou REDIS_URL`
      : "REDIS_URL";
    throw new Error(
      `FATAL: ${envName} não definido. Defina a variável de ambiente antes de iniciar.`
    );
  }

  const resolvedVia = dedicatedUrl ? dedicatedEnvName! : "REDIS_URL";
  const usedFallback = dedicatedEnvName !== null && !dedicatedUrl;

  if (!loggedPurposes.has(purpose)) {
    loggedPurposes.add(purpose);
    logger.info(
      {
        purpose,
        envVar: resolvedVia,
        fallback: usedFallback,
        host: describeRedisHost(url),
      },
      `[Redis:${purpose}] URL resolvida via ${resolvedVia}${usedFallback ? " (fallback — variável dedicada não definida)" : ""}`
    );
  }

  return url;
}

export function buildRedisKey(scope: string, key: string): string {
  return `${REDIS_KEY_PREFIX}:${scope}:${key}`;
}
