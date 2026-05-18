import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { QUEUE_PREFIX } from "./config";
import { createQueueRedisConnection } from "./connection";
import type { QueueJobPayload, QueueName } from "./contracts";

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
    count: 5_000,
  },
};

const queues = new Map<QueueName, Queue<QueueJobPayload>>();
const queueEvents = new Map<QueueName, QueueEvents>();

export function getQueue(name: QueueName): Queue<QueueJobPayload> {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue<QueueJobPayload>(name, {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  queues.set(name, queue);
  return queue;
}

export function getQueueEvents(name: QueueName): QueueEvents {
  const existing = queueEvents.get(name);
  if (existing) return existing;

  const events = new QueueEvents(name, {
    connection: createQueueRedisConnection(),
    prefix: QUEUE_PREFIX,
  });

  queueEvents.set(name, events);
  return events;
}

export async function closeQueueInfra(): Promise<void> {
  await Promise.allSettled([
    ...Array.from(queueEvents.values()).map((events) => events.close()),
    ...Array.from(queues.values()).map((queue) => queue.close()),
  ]);

  queueEvents.clear();
  queues.clear();
}