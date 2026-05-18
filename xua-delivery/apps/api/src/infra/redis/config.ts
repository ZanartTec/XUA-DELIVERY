type RedisPurpose = "cache" | "queue" | "default";

const ENV = process.env.NODE_ENV ?? "development";
const DEFAULT_PREFIX = `xua:${ENV}`;

export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? DEFAULT_PREFIX;

export function getRedisUrl(purpose: RedisPurpose = "default"): string {
  const url =
    purpose === "cache"
      ? process.env.CACHE_REDIS_URL ?? process.env.REDIS_URL
      : purpose === "queue"
        ? process.env.QUEUE_REDIS_URL ?? process.env.REDIS_URL
        : process.env.REDIS_URL;

  if (!url) {
    const envName =
      purpose === "cache"
        ? "CACHE_REDIS_URL ou REDIS_URL"
        : purpose === "queue"
          ? "QUEUE_REDIS_URL ou REDIS_URL"
          : "REDIS_URL";
    throw new Error(
      `FATAL: ${envName} não definido. Defina a variável de ambiente antes de iniciar.`
    );
  }

  return url;
}

export function buildRedisKey(scope: string, key: string): string {
  return `${REDIS_KEY_PREFIX}:${scope}:${key}`;
}