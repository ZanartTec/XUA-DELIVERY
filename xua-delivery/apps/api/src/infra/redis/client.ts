import Redis from "ioredis";
import { logger } from "../logger";
import { getRedisUrl } from "./config";

const REDIS_URL = getRedisUrl("cache");
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err: Error) => {
  logger.error({ err }, "[Redis] Erro de conexão");
});

export async function ensureConnected(): Promise<void> {
  if (redis.status === "ready") return;
  if (redis.status === "connecting" || redis.status === "connect") {
    await new Promise<void>((resolve) => redis.once("ready", resolve));
    return;
  }
  await redis.connect();
  logger.info("[Redis] Conectado com sucesso");
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("Redis disconnected");
  } catch (err) {
    logger.error({ err }, "Error disconnecting Redis");
  }
}

export default redis;
