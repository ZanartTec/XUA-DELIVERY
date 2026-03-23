import redis, { ensureConnected } from "@/src/lib/redis";

const RATE_LIMIT_PREFIX = "rl:";

interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
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
} as const;
