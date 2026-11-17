import { randomUUID } from "node:crypto";
import { getQueue } from "./queues";
import {
  NOTIFICATION_JOB_NAMES,
  QUEUE_NAMES,
  type PushIntent,
  type PushNotificationJobPayload,
} from "./contracts";

/** BullMQ não aceita ":" em jobId (é o separador das chaves no Redis). */
export function pushJobId(dedupeKey: string): string {
  return `push-${dedupeKey.replace(/:/g, "_")}`;
}

/**
 * Enfileira um push (T5.3). `jobId` derivado do `dedupeKey`: o mesmo aviso
 * enfileirado duas vezes (webhook reprocessado, retry do chamador) vira um
 * job só enquanto o primeiro existir na fila.
 */
export async function enqueuePushNotification(
  intent: PushIntent,
  source: PushNotificationJobPayload["source"] = "api"
) {
  const correlationId = randomUUID();
  const payload: PushNotificationJobPayload = {
    jobName: NOTIFICATION_JOB_NAMES.sendPush,
    intent,
    correlationId,
    requestedAt: new Date().toISOString(),
    source,
  };

  const queue = getQueue(QUEUE_NAMES.notifications);
  const job = await queue.add(NOTIFICATION_JOB_NAMES.sendPush, payload, {
    jobId: pushJobId(intent.dedupeKey),
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { age: 3_600, count: 1_000 },
    removeOnFail: { age: 86_400, count: 1_000 },
  });
  return { id: job.id, name: job.name, correlationId };
}
