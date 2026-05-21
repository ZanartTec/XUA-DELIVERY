import { randomUUID } from "node:crypto";
import { getQueue } from "./queues";
import {
  PAYMENT_JOB_NAMES,
  QUEUE_NAMES,
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
