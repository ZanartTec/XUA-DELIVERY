import { randomUUID } from "node:crypto";
import { getQueue } from "./queues";
import {
  INTERNAL_JOB_NAMES,
  SUBSCRIPTION_JOB_NAMES,
  QUEUE_NAMES,
  type InternalJobPayload,
  type SubscriptionExpirationJobPayload,
} from "./contracts";

/**
 * Enfileira a geração direcionada de pedidos de uma assinatura recém-ativada
 * (geração por evento — D4). Reusa a fila `internalJobs` e o mesmo handler
 * idempotente do cron; passar `subscriptionId` restringe à assinatura.
 */
export async function enqueueSubscriptionGeneration(subscriptionId: string) {
  const correlationId = randomUUID();
  const payload: InternalJobPayload = {
    jobName: INTERNAL_JOB_NAMES.subscriptionGeneration,
    subscriptionId,
    correlationId,
    requestedAt: new Date().toISOString(),
    source: "worker",
  };

  const queue = getQueue(QUEUE_NAMES.internalJobs);
  const job = await queue.add(INTERNAL_JOB_NAMES.subscriptionGeneration, payload);
  return { id: job.id, name: job.name, correlationId };
}

function getSubscriptionExpirationDelayMs(): number {
  const minutes = Number(process.env.PAYMENT_EXPIRATION_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60 * 1000;
}

/**
 * Agenda (ou re-arma) a expiração de uma assinatura `PENDING_PAYMENT`.
 *
 * Re-arme: remove qualquer job pendente com o mesmo `jobId` antes de reagendar,
 * de modo que `resumePayment` reinicie a janela de expiração a partir de agora
 * (BullMQ ignora `add` com jobId duplicado, então é preciso remover primeiro).
 * O processor é idempotente: só cancela se a assinatura ainda estiver
 * `PENDING_PAYMENT` no momento da execução (ver D11 da arquitetura).
 */
export async function scheduleSubscriptionExpiration(subscriptionId: string) {
  const correlationId = randomUUID();
  const payload: SubscriptionExpirationJobPayload = {
    jobName: SUBSCRIPTION_JOB_NAMES.expireSubscription,
    subscriptionId,
    correlationId,
    requestedAt: new Date().toISOString(),
    source: "api",
  };

  const delayMs = getSubscriptionExpirationDelayMs();
  const jobId = `expire-subscription-${subscriptionId}`;
  const queue = getQueue(QUEUE_NAMES.subscriptionExpiration);

  // Re-arma a janela: descarta o job anterior (se houver) antes de reagendar.
  await queue.remove(jobId).catch(() => undefined);

  const job = await queue.add(SUBSCRIPTION_JOB_NAMES.expireSubscription, payload, {
    jobId,
    delay: delayMs,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  });

  return { id: job.id, name: job.name, correlationId, delayMs };
}
