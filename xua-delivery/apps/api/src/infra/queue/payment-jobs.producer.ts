import { randomUUID } from "node:crypto";
import { getQueue } from "./queues";
import {
  PAYMENT_JOB_NAMES,
  QUEUE_NAMES,
  type PaymentExpirationJobPayload,
  type PaymentWebhookJobPayload,
} from "./contracts";

interface EnqueuePaymentWebhookJobInput {
  webhookEventId: string;
  source: PaymentWebhookJobPayload["source"];
  correlationId?: string;
  jobId?: string;
}

export async function enqueuePaymentWebhookJob(input: EnqueuePaymentWebhookJobInput) {
  const correlationId = input.correlationId ?? randomUUID();
  const payload: PaymentWebhookJobPayload = {
    jobName: PAYMENT_JOB_NAMES.processWebhook,
    webhookEventId: input.webhookEventId,
    correlationId,
    requestedAt: new Date().toISOString(),
    source: input.source,
  };

  const queue = getQueue(QUEUE_NAMES.paymentWebhooks);
  const job = await queue.add(PAYMENT_JOB_NAMES.processWebhook, payload, {
    jobId: input.jobId,
  });

  return {
    id: job.id,
    name: job.name,
    correlationId,
  };
}

// ─── Payment Expiration ─────────────────────────────────────────

const PAYMENT_EXPIRATION_DELAY_MS =
  (Number(process.env.PAYMENT_EXPIRATION_MINUTES)) * 60 * 1000;

/**
 * Agenda um job delayed para expirar o pagamento de um pedido.
 * O job será executado após PAYMENT_EXPIRATION_MINUTES (default: 15min).
 *
 * Idempotência: usa `jobId: expire-payment-${orderId}` — BullMQ ignora
 * jobs com ID duplicado, garantindo no máximo 1 job por pedido.
 */
export async function schedulePaymentExpiration(orderId: string) {
  const correlationId = randomUUID();
  const payload: PaymentExpirationJobPayload = {
    jobName: PAYMENT_JOB_NAMES.expirePayment,
    orderId,
    correlationId,
    requestedAt: new Date().toISOString(),
    source: "api",
  };

  const queue = getQueue(QUEUE_NAMES.payments);
  const job = await queue.add(PAYMENT_JOB_NAMES.expirePayment, payload, {
    jobId: `expire-payment-${orderId}`,
    delay: PAYMENT_EXPIRATION_DELAY_MS,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  });

  return {
    id: job.id,
    name: job.name,
    correlationId,
    delayMs: PAYMENT_EXPIRATION_DELAY_MS,
  };
}
