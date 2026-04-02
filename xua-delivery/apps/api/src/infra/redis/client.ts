import Redis from "ioredis";
import { logger } from "../logger";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error(
    "FATAL: REDIS_URL não definido. Defina a variável de ambiente antes de iniciar."
  );
}

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
