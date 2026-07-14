import IORedis from "ioredis";
import { logger } from "../logger";
import { getQueueRedisUrl } from "./config";

export function createQueueRedisConnection(): IORedis {
  const connection = new IORedis(getQueueRedisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  connection.on("error", (err: Error) => {
    logger.error({ err }, "[Redis:queue] Erro de conexão");
  });

  return connection;
}
