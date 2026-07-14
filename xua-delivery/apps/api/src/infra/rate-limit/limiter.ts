import redis, { ensureConnected } from "../redis/client";
import { createLogger } from "../logger";

const log = createLogger("rate-limit");

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
 *
 * Fail-open: se o Redis de cache estiver indisponível, o request é PERMITIDO
 * (com log de warning). Derrubar auth/checkout por indisponibilidade de cache
 * custa mais que uma janela curta sem rate limit.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  try {
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
  } catch (err) {
    log.warn(
      { err, key },
      "[Redis:cache] Rate limit indisponível — fail-open, request permitido"
    );
    return {
      allowed: true,
      remaining: config.maxRequests,
      retryAfterSeconds: 0,
    };
  }
}

// Configurações pré-definidas por categoria
export const RATE_LIMITS = {
  global: { windowSeconds: 60, maxRequests: 100 },
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
