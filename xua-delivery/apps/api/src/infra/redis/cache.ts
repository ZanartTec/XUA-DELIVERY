import redis from "./client";
import { buildRedisKey } from "./config";
import { createLogger } from "../logger";

const log = createLogger("redis-cache");

export async function getCacheJson<T>(key: string): Promise<T | null> {
  const redisKey = buildRedisKey("cache", key);

  try {
    const cached = await redis.get(redisKey);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (err) {
    log.warn({ err, key: redisKey }, "Cache read failed; falling back");
    return null;
  }
}

export async function setCacheJson(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const redisKey = buildRedisKey("cache", key);

  try {
    await redis.set(redisKey, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    log.warn({ err, key: redisKey }, "Cache write failed");
  }
}

export async function deleteCacheKey(key: string): Promise<void> {
  const redisKey = buildRedisKey("cache", key);

  try {
    await redis.del(redisKey);
  } catch (err) {
    log.warn({ err, key: redisKey }, "Cache invalidation failed");
  }
}