import { Queue, type JobsOptions } from "bullmq";
import type IORedis from "ioredis";
import { createLogger } from "../logger";
import { QUEUE_PREFIX } from "./config";
import { createQueueRedisConnection } from "./connection";
import type { QueueJobPayload, QueueName } from "./contracts";

const log = createLogger("queue");

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

/**
 * Uma conexão Redis para TODAS as filas que só enfileiram, por processo.
 *
 * Enfileirar não usa comando bloqueante, então as filas podem dividir a
 * conexão (recomendação do BullMQ); antes cada fila abria a sua. O Redis
 * gratuito do Render aceita 50 conexões, e no deploy a instância nova e a
 * antiga coexistem por instantes. Os Workers continuam com conexão própria:
 * eles bloqueiam esperando job.
 */
let sharedProducerConnection: IORedis | null = null;

function getSharedProducerConnection(): IORedis {
  if (sharedProducerConnection) return sharedProducerConnection;
  const connection = createQueueRedisConnection();
  connection.on("error", (err: Error) => {
    log.warn({ err }, "Queue producer Redis connection error");
  });
  sharedProducerConnection = connection;
  return connection;
}

export function getQueue(name: QueueName): Queue<QueueJobPayload> {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue<QueueJobPayload>(name, {
    connection: getSharedProducerConnection(),
    prefix: QUEUE_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  // Sem ouvinte, o BullMQ imprime o erro cru no console (sem contexto).
  queue.on("error", (err: Error) => {
    log.warn({ err, queue: name }, "Queue error");
  });

  queues.set(name, queue);
  return queue;
}

export async function closeQueueInfra(): Promise<void> {
  await Promise.allSettled(Array.from(queues.values()).map((queue) => queue.close()));
  queues.clear();

  // Conexão compartilhada: as filas não a fecham, então fecha aqui.
  if (sharedProducerConnection) {
    const connection = sharedProducerConnection;
    sharedProducerConnection = null;
    await connection.quit().catch(() => connection.disconnect());
  }
}
