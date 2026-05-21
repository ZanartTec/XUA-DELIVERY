import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
} from "@prisma/client";
import {
  PAYMENT_JOB_NAMES,
  type PaymentWebhookJobPayload,
} from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { getPrisma } from "../../infra/prisma/client";
import { auditRepository } from "../../modules/audit/index.js";
import { orderService } from "../../modules/orders/index.js";
import { getPaymentGateway, PAYMENT_PROVIDERS } from "../../modules/payments/gateway/payments.gateway.js";

const log = createLogger("payment-jobs-worker");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paymentStatusFromMercadoPago(status: string): PaymentStatus {
  switch (status) {
    case "approved":
      return PaymentStatus.CAPTURED;
    case "authorized":
      return PaymentStatus.AUTHORIZED;
    case "rejected":
    case "cancelled":
      return PaymentStatus.FAILED;
    case "refunded":
    case "charged_back":
      return PaymentStatus.REFUNDED;
    default:
      return PaymentStatus.CREATED;
  }
}

function paymentStatusToOrderPaymentStatus(status: PaymentStatus): string | undefined {
  switch (status) {
    case PaymentStatus.CAPTURED:
      return "paid";
    case PaymentStatus.FAILED:
      return "failed";
    case PaymentStatus.REFUNDED:
      return "refunded";
    case PaymentStatus.AUTHORIZED:
    case PaymentStatus.CREATED:
      return "pending";
  }
}

function auditEventForPaymentStatus(status: PaymentStatus): AuditEventType {
  switch (status) {
    case PaymentStatus.CAPTURED:
      return AuditEventType.PAYMENT_CAPTURED;
    case PaymentStatus.FAILED:
    case PaymentStatus.REFUNDED:
      return AuditEventType.PAYMENT_FAILED;
    default:
      return AuditEventType.PAYMENT_CREATED;
  }
}

function isInvalidRegression(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === PaymentStatus.REFUNDED && next !== PaymentStatus.REFUNDED) return true;
  if (current === PaymentStatus.CAPTURED && next === PaymentStatus.CREATED) return true;
  if (current === PaymentStatus.FAILED && next === PaymentStatus.CREATED) return true;
  return false;
}

function getResourceId(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as Record<string, unknown>;
  const { data } = body;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { id } = data as Record<string, unknown>;
  return id == null ? null : String(id);
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

async function resolveOrderId(
  tx: Prisma.TransactionClient,
  providerPayment: {
    providerPaymentId: string;
    orderReference?: string;
    externalReference?: string;
  }
): Promise<string | null> {
  if (isUuid(providerPayment.orderReference)) {
    return providerPayment.orderReference;
  }

  if (isUuid(providerPayment.externalReference)) {
    return providerPayment.externalReference;
  }

  const existing = await tx.payment.findFirst({
    where: {
      provider: PAYMENT_PROVIDERS.mercadoPago,
      provider_payment_ref: providerPayment.providerPaymentId,
      order_id: { not: null },
    },
    orderBy: { created_at: "desc" },
    select: { order_id: true },
  });

  return existing?.order_id ?? null;
}

async function finishOrderAfterPaymentCaptured(orderId: string): Promise<void> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  if (order.status === OrderStatus.PAYMENT_PENDING) {
    await orderService.confirmOrder(orderId);
  }

  const updated = await prisma.order.findUnique({ where: { id: orderId } });
  if (updated?.status === OrderStatus.CONFIRMED) {
    await orderService.sendToDistributor(orderId);
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

  const gateway = getPaymentGateway();
  if (!gateway.getPayment) {
    throw new Error("PAYMENT_PROVIDER_DOES_NOT_SUPPORT_STATUS_LOOKUP");
  }

  const providerPayment = await gateway.getPayment(providerPaymentId);
  const nextStatus = paymentStatusFromMercadoPago(providerPayment.status);

  let shouldFinalizeOrder = false;
  let resolvedOrderId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const orderId = await resolveOrderId(tx, providerPayment);
    if (!orderId) {
      throw new Error(`PAYMENT_ORDER_REFERENCE_MISSING:${providerPaymentId}`);
    }

    resolvedOrderId = orderId;

    const existing = await tx.payment.findFirst({
      where: { order_id: orderId, provider: PAYMENT_PROVIDERS.mercadoPago },
      orderBy: { created_at: "desc" },
    });

    if (existing && existing.amount_cents > 0 && providerPayment.amountCents > 0 && existing.amount_cents !== providerPayment.amountCents) {
      throw new Error(
        `PAYMENT_AMOUNT_MISMATCH:${existing.amount_cents}:${providerPayment.amountCents}`
      );
    }

    if (existing && isInvalidRegression(existing.status, nextStatus)) {
      await tx.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { processed_at: new Date(), processing_error: "IGNORED_STATUS_REGRESSION" },
      });
      return;
    }

    const payment = existing
      ? await tx.payment.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            provider_payment_ref: providerPayment.providerPaymentId,
            paid_at: nextStatus === PaymentStatus.CAPTURED ? providerPayment.paidAt ?? new Date() : existing.paid_at,
          },
        })
      : await tx.payment.create({
          data: {
            order_id: orderId,
            kind: PaymentKind.ORDER,
            amount_cents: providerPayment.amountCents,
            status: nextStatus,
            provider: PAYMENT_PROVIDERS.mercadoPago,
            provider_payment_ref: providerPayment.providerPaymentId,
            external_id: providerPayment.providerPaymentId,
            paid_at: nextStatus === PaymentStatus.CAPTURED ? providerPayment.paidAt ?? new Date() : null,
          },
        });

    await tx.paymentTransaction.create({
      data: {
        payment_id: payment.id,
        action: `webhook:${event.event_type}`,
        provider_status: providerPayment.status,
        provider_response: {
          providerPaymentId: providerPayment.providerPaymentId,
          status: providerPayment.status,
          statusDetail: providerPayment.statusDetail,
          externalReference: providerPayment.externalReference,
          amountCents: providerPayment.amountCents,
          providerSnapshot: providerPayment.raw,
        } as Prisma.InputJsonObject,
        idempotency_key: event.provider_event_ref,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { payment_status: paymentStatusToOrderPaymentStatus(nextStatus) },
    });

    await auditRepository.emit(
      {
        eventType: auditEventForPaymentStatus(nextStatus),
        actor: { type: ActorType.SYSTEM, id: "mercadopago-webhook" },
        orderId,
        sourceApp: SourceApp.BACKEND,
        payload: {
          paymentId: payment.id,
          providerPaymentId: providerPayment.providerPaymentId,
          providerStatus: providerPayment.status,
          nextStatus,
          webhookEventId: event.id,
        },
      },
      tx
    );

    await tx.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed_at: new Date(), processing_error: null },
    });

    shouldFinalizeOrder = nextStatus === PaymentStatus.CAPTURED;
  });

  if (!resolvedOrderId) {
    throw new Error(`PAYMENT_ORDER_REFERENCE_MISSING:${providerPaymentId}`);
  }

  if (shouldFinalizeOrder) {
    await finishOrderAfterPaymentCaptured(resolvedOrderId);
  }

  return {
    ok: true,
    providerPaymentId,
    orderId: resolvedOrderId,
    status: nextStatus,
  };
}

export async function processPaymentJob(job: Job<PaymentWebhookJobPayload>) {
  const { jobName, correlationId } = job.data;
  log.info({ jobId: job.id, jobName, correlationId }, "Payment job started");

  try {
    switch (jobName) {
      case PAYMENT_JOB_NAMES.processWebhook:
        return await processWebhook(job);
    }
  } catch (error) {
    const prisma = getPrisma();
    await prisma.paymentWebhookEvent.update({
      where: { id: job.data.webhookEventId },
      data: {
        processing_error: error instanceof Error ? error.message : String(error),
        retry_count: { increment: 1 },
      },
    }).catch((updateError) => {
      log.error({ updateError, webhookEventId: job.data.webhookEventId }, "Failed to mark payment webhook error");
    });
    throw error;
  }
}
