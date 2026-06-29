import type { Job } from "bullmq";
import {
  PAYMENT_JOB_NAMES,
  type PaymentWebhookJobPayload,
} from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { getPrisma } from "../../infra/prisma/client";
import { getPaymentGateway } from "../../modules/payments/gateway/payments.gateway.js";
import { distributorGatewayService } from "../../modules/distributor-gateway/index.js";
import {
  finalizePaymentTarget,
  processPaymentTarget,
} from "./payment-webhook/payment-webhook.handlers.js";
import {
  findExistingPayment,
  getResourceId,
  getWebhookPaymentContext,
  resolvePaymentTarget,
} from "./payment-webhook/payment-webhook.resolver.js";
import {
  NonRetryablePaymentWebhookError,
} from "./payment-webhook/payment-webhook.types.js";

const log = createLogger("payment-jobs-worker");

type PaymentJobHandler = (job: Job<PaymentWebhookJobPayload>) => Promise<unknown>;

function logMissingReference(input: {
  providerPaymentId: string;
  webhookEventId: string;
  attemptsMade: number;
  hasExternalReference: boolean;
  hasOrderReference: boolean;
  paymentKind?: string;
  contextReferenceId?: string;
  contextPaymentKind?: string;
}) {
  log.warn(input, "Payment webhook reference missing");
}

async function markWebhookProcessed(webhookEventId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.paymentWebhookEvent.update({
    where: { id: webhookEventId },
    data: { processed_at: new Date(), processing_error: null },
  });
}

async function markRetryableWebhookError(
  webhookEventId: string,
  error: unknown
): Promise<void> {
  const prisma = getPrisma();
  await prisma.paymentWebhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processing_error: error instanceof Error ? error.message : String(error),
      retry_count: { increment: 1 },
    },
  }).catch((updateError) => {
    log.error({ updateError, webhookEventId }, "Failed to mark payment webhook error");
  });
}

async function markNonRetryableWebhookError(
  webhookEventId: string,
  error: NonRetryablePaymentWebhookError
): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEventId },
      data: {
        processed_at: new Date(),
        processing_error: error.message,
        retry_count: { increment: 1 },
      },
    });
  } catch (updateError) {
    log.error({ updateError, webhookEventId }, "Failed to mark non-retryable payment webhook error");
    throw updateError;
  }
}

async function processWebhook(job: Job<PaymentWebhookJobPayload>) {
  const prisma = getPrisma();
  const event = await prisma.paymentWebhookEvent.findUnique({
    where: { id: job.data.webhookEventId },
  });

  if (!event) {
    throw new Error(`PAYMENT_WEBHOOK_EVENT_NOT_FOUND:${job.data.webhookEventId}`);
  }

  if (event.processed_at) {
    return { ok: true, skipped: "already_processed" };
  }

  const providerPaymentId = getResourceId(event.payload);
  if (!providerPaymentId) {
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed_at: new Date(), processing_error: "RESOURCE_ID_MISSING" },
    });
    return { ok: true, skipped: "resource_id_missing" };
  }

  // O getPayment precisa do token DA DISTRIBUIDORA dona do pagamento. O
  // controller já gravou distributor_id no evento ao validar o webhook.
  if (!event.distributor_id) {
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed_at: new Date(), processing_error: "DISTRIBUTOR_MISSING" },
    });
    return { ok: true, skipped: "distributor_missing" };
  }

  const credentials = await distributorGatewayService.getDecryptedCredentials(event.distributor_id);
  if (!credentials) {
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed_at: new Date(), processing_error: "GATEWAY_NOT_CONFIGURED" },
    });
    return { ok: true, skipped: "gateway_not_configured" };
  }

  const gateway = getPaymentGateway({ accessToken: credentials.accessToken });
  if (!gateway.getPayment) {
    throw new Error("PAYMENT_PROVIDER_DOES_NOT_SUPPORT_STATUS_LOOKUP");
  }
  if (!gateway.normalizeStatus) {
    throw new Error("PAYMENT_PROVIDER_DOES_NOT_SUPPORT_STATUS_NORMALIZATION");
  }

  const providerPayment = await gateway.getPayment(providerPaymentId);
  const webhookContext = getWebhookPaymentContext(event.payload);
  const nextStatus = gateway.normalizeStatus(providerPayment.status);

  const outcome = await prisma.$transaction(async (tx) => {
    const existingPayment = await findExistingPayment(tx, providerPayment, webhookContext);
    const target = await resolvePaymentTarget(tx, providerPayment, existingPayment, webhookContext);
    if (!target) {
      logMissingReference({
        providerPaymentId,
        webhookEventId: event.id,
        attemptsMade: job.attemptsMade,
        hasExternalReference: Boolean(providerPayment.externalReference),
        hasOrderReference: Boolean(providerPayment.orderReference),
        paymentKind: providerPayment.paymentKind,
        contextReferenceId: webhookContext.referenceId,
        contextPaymentKind: webhookContext.paymentKind,
      });
      throw new Error(`PAYMENT_REFERENCE_MISSING:${providerPaymentId}`);
    }

    return processPaymentTarget({
      tx,
      event,
      target,
      existingPayment,
      providerPayment,
      nextStatus,
    });
  });

  if (!outcome.webhookMarkedProcessed) {
    await finalizePaymentTarget(outcome);
    await markWebhookProcessed(event.id);
  }

  log.info(
    {
      providerPaymentId,
      webhookEventId: event.id,
      orderId: outcome.orderId,
      subscriptionId: outcome.subscriptionId,
      status: nextStatus,
      amountCents: providerPayment.amountCents,
      finalizedOrder: outcome.shouldFinalize && Boolean(outcome.orderId),
    },
    "Payment webhook processed"
  );

  return {
    ok: true,
    providerPaymentId,
    orderId: outcome.orderId,
    subscriptionId: outcome.subscriptionId,
    status: nextStatus,
  };
}

const PAYMENT_JOB_HANDLERS: Record<PaymentWebhookJobPayload["jobName"], PaymentJobHandler> = {
  [PAYMENT_JOB_NAMES.processWebhook]: processWebhook,
};

export async function processPaymentJob(job: Job<PaymentWebhookJobPayload>) {
  const { jobName, correlationId } = job.data;
  log.info({ jobId: job.id, jobName, correlationId }, "Payment job started");

  try {
    return await PAYMENT_JOB_HANDLERS[jobName](job);
  } catch (error) {
    if (error instanceof NonRetryablePaymentWebhookError) {
      await markNonRetryableWebhookError(job.data.webhookEventId, error);
      log.error(
        { err: error, webhookEventId: job.data.webhookEventId, jobId: job.id },
        "Payment webhook rejected without retry"
      );
      return { ok: false, retryable: false, error: error.message };
    }

    await markRetryableWebhookError(job.data.webhookEventId, error);
    throw error;
  }
}
