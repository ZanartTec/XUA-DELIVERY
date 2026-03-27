import redis, { ensureConnected } from "@/src/lib/redis";

const BLACKLIST_PREFIX = "jwt:bl:";

/**
 * Adiciona um JTI de JWT ao blacklist do Redis.
 * TTL = tempo restante até expiração do token original.
 */
export async function blacklistToken(jti: string, expiresAt: number): Promise<void> {
  await ensureConnected();
  const ttlSeconds = Math.max(expiresAt - Math.floor(Date.now() / 1000), 1);
  await redis.set(`${BLACKLIST_PREFIX}${jti}`, "1", "EX", ttlSeconds);
}

/**
 * Verifica se um JTI está no blacklist.
 */
export async function isBlacklisted(jti: string): Promise<boolean> {
  await ensureConnected();
  const result = await redis.get(`${BLACKLIST_PREFIX}${jti}`);
  return result !== null;
}
