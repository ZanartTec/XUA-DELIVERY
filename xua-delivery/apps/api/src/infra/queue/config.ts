import { REDIS_KEY_PREFIX, getRedisUrl } from "../redis/config";

export const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? `${REDIS_KEY_PREFIX}:queue`;

export function getQueueRedisUrl(): string {
  return getRedisUrl("queue");
}