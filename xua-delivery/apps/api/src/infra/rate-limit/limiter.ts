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

// Configurações pré-definidas por categoria
export const RATE_LIMITS = {
  global: { windowSeconds: 60, maxRequests: 100 },
  auth: { windowSeconds: 60, maxRequests: 10 },
  orders: { windowSeconds: 60, maxRequests: 30 },
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
