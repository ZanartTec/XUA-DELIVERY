import IORedis from "ioredis";
import { getQueueRedisUrl } from "./config";

export function createQueueRedisConnection(): IORedis {
  return new IORedis(getQueueRedisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}