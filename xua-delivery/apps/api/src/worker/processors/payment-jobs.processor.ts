import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
  UserSubscriptionStatus,
} from "@xua/shared/enums";
import {
  PAYMENT_JOB_NAMES,
  type PaymentWebhookJobPayload,
} from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { getPrisma } from "../../infra/prisma/client";
import { auditRepository } from "../../modules/audit/index.js";
import { orderService } from "../../modules/orders/index.js";
import {
  getPaymentGateway,
  PAYMENT_PROVIDERS,
  type ProviderPaymentDetails,
} from "../../modules/payments/gateway/payments.gateway.js";

const log = createLogger("payment-jobs-worker");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolvedPaymentTarget =
  | { kind: "ORDER"; orderId: string }
  | { kind: "SUBSCRIPTION"; subscriptionId: string };

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

function paymentKindFromProvider(kind: string | null | undefined): PaymentKind | null {
  switch (kind?.toUpperCase()) {
    case PaymentKind.ORDER:
      return PaymentKind.ORDER;
    case PaymentKind.SUBSCRIPTION:
      return PaymentKind.SUBSCRIPTION;
    case PaymentKind.DEPOSIT:
      return PaymentKind.DEPOSIT;
    default:
      return null;
  }
}

function getUuidReferences(providerPayment: ProviderPaymentDetails): string[] {
  return [providerPayment.orderReference, providerPayment.externalReference].filter(isUuid);
}

async function findExistingPayment(
  tx: Prisma.TransactionClient,
  providerPayment: ProviderPaymentDetails
) {
  const referenceIds = [
    providerPayment.providerPaymentId,
    providerPayment.externalReference,
    providerPayment.orderReference,
  ].filter((value): value is string => Boolean(value));
  const uuidReferences = getUuidReferences(providerPayment);

  return tx.payment.findFirst({
    where: {
      provider: PAYMENT_PROVIDERS.mercadoPago,
      OR: [
        { provider_payment_ref: { in: referenceIds } },
        { external_id: { in: referenceIds } },
        ...(uuidReferences.length > 0
          ? [
              { order_id: { in: uuidReferences } },
              { user_subscription_id: { in: uuidReferences } },
            ]
          : []),
      ],
    },
    orderBy: { created_at: "desc" },
  });
}

async function findOrderReference(
  tx: Prisma.TransactionClient,
  references: string[]
): Promise<string | null> {
  if (references.length === 0) return null;
  const order = await tx.order.findFirst({
    where: { id: { in: references } },
    select: { id: true },
  });

  return order?.id ?? null;
}

async function findSubscriptionReference(
  tx: Prisma.TransactionClient,
  references: string[]
): Promise<string | null> {
  if (references.length === 0) return null;
  const subscription = await tx.userSubscription.findFirst({
    where: { id: { in: references } },
    select: { id: true },
  });

  return subscription?.id ?? null;
}

async function resolvePaymentTarget(
  tx: Prisma.TransactionClient,
  providerPayment: ProviderPaymentDetails,
  existing: Awaited<ReturnType<typeof findExistingPayment>>
): Promise<
    ResolvedPaymentTarget | null
  > {
  if (existing?.order_id) {
    return { kind: PaymentKind.ORDER, orderId: existing.order_id };
  }

  if (existing?.user_subscription_id) {
    return { kind: PaymentKind.SUBSCRIPTION, subscriptionId: existing.user_subscription_id };
  }

  const references = getUuidReferences(providerPayment);
  const kindHint = paymentKindFromProvider(providerPayment.paymentKind);

  if (kindHint === PaymentKind.ORDER) {
    const orderId = await findOrderReference(tx, references);
    return orderId ? { kind: PaymentKind.ORDER, orderId } : null;
  }

  if (kindHint === PaymentKind.SUBSCRIPTION) {
    const subscriptionId = await findSubscriptionReference(tx, references);
    return subscriptionId ? { kind: PaymentKind.SUBSCRIPTION, subscriptionId } : null;
  }

  const orderId = await findOrderReference(tx, references);
  if (orderId) return { kind: PaymentKind.ORDER, orderId };

  const subscriptionId = await findSubscriptionReference(tx, references);
  return subscriptionId ? { kind: PaymentKind.SUBSCRIPTION, subscriptionId } : null;
}

function buildProviderResponse(providerPayment: ProviderPaymentDetails): Prisma.InputJsonObject {
  return {
    providerPaymentId: providerPayment.providerPaymentId,
    status: providerPayment.status,
    statusDetail: providerPayment.statusDetail,
    externalReference: providerPayment.externalReference,
    orderReference: providerPayment.orderReference,
    paymentKind: providerPayment.paymentKind,
    paymentMethod: providerPayment.paymentMethod,
    amountCents: providerPayment.amountCents,
    providerSnapshot: providerPayment.raw,
  } as Prisma.InputJsonObject;
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
  let resolvedSubscriptionId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const existing = await findExistingPayment(tx, providerPayment);
    const target = await resolvePaymentTarget(tx, providerPayment, existing);
    if (!target) {
      throw new Error(`PAYMENT_REFERENCE_MISSING:${providerPaymentId}`);
    }

    if (target.kind === PaymentKind.ORDER) {
      const { orderId } = target;
      resolvedOrderId = orderId;

      const orderPayment = existing?.order_id === orderId
        ? existing
        : await tx.payment.findFirst({
            where: { order_id: orderId, provider: PAYMENT_PROVIDERS.mercadoPago },
            orderBy: { created_at: "desc" },
          });

      if (
        orderPayment
        && orderPayment.amount_cents > 0
        && providerPayment.amountCents > 0
        && orderPayment.amount_cents !== providerPayment.amountCents
      ) {
        throw new Error(
          `PAYMENT_AMOUNT_MISMATCH:${orderPayment.amount_cents}:${providerPayment.amountCents}`
        );
      }

      if (orderPayment && isInvalidRegression(orderPayment.status, nextStatus)) {
        await tx.paymentWebhookEvent.update({
          where: { id: event.id },
          data: { processed_at: new Date(), processing_error: "IGNORED_STATUS_REGRESSION" },
        });
        return;
      }

      const payment = orderPayment
        ? await tx.payment.update({
            where: { id: orderPayment.id },
            data: {
              status: nextStatus,
              provider_payment_ref: providerPayment.providerPaymentId,
              payment_method: providerPayment.paymentMethod ?? orderPayment.payment_method,
              paid_at: nextStatus === PaymentStatus.CAPTURED
                ? providerPayment.paidAt ?? new Date()
                : orderPayment.paid_at,
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
              payment_method: providerPayment.paymentMethod,
              paid_at: nextStatus === PaymentStatus.CAPTURED
                ? providerPayment.paidAt ?? new Date()
                : null,
            },
          });

      await tx.paymentTransaction.create({
        data: {
          payment_id: payment.id,
          action: `webhook:${event.event_type}`,
          provider_status: providerPayment.status,
          provider_response: buildProviderResponse(providerPayment),
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

      shouldFinalizeOrder = nextStatus === PaymentStatus.CAPTURED;
    } else if (target.kind === PaymentKind.SUBSCRIPTION) {
      const { subscriptionId } = target;
      resolvedSubscriptionId = subscriptionId;

      const subscriptionPayment = existing?.user_subscription_id === subscriptionId
        ? existing
        : await tx.payment.findFirst({
            where: {
              user_subscription_id: subscriptionId,
              provider: PAYMENT_PROVIDERS.mercadoPago,
            },
            orderBy: { created_at: "desc" },
          });

      if (
        subscriptionPayment
        && subscriptionPayment.amount_cents > 0
        && providerPayment.amountCents > 0
        && subscriptionPayment.amount_cents !== providerPayment.amountCents
      ) {
        throw new Error(
          `PAYMENT_AMOUNT_MISMATCH:${subscriptionPayment.amount_cents}:${providerPayment.amountCents}`
        );
      }

      if (subscriptionPayment && isInvalidRegression(subscriptionPayment.status, nextStatus)) {
        await tx.paymentWebhookEvent.update({
          where: { id: event.id },
          data: { processed_at: new Date(), processing_error: "IGNORED_STATUS_REGRESSION" },
        });
        return;
      }

      const payment = subscriptionPayment
        ? await tx.payment.update({
            where: { id: subscriptionPayment.id },
            data: {
              status: nextStatus,
              provider_payment_ref: providerPayment.providerPaymentId,
              payment_method: providerPayment.paymentMethod ?? subscriptionPayment.payment_method,
              paid_at: nextStatus === PaymentStatus.CAPTURED
                ? providerPayment.paidAt ?? new Date()
                : subscriptionPayment.paid_at,
            },
          })
        : await tx.payment.create({
            data: {
              user_subscription_id: subscriptionId,
              kind: PaymentKind.SUBSCRIPTION,
              amount_cents: providerPayment.amountCents,
              status: nextStatus,
              provider: PAYMENT_PROVIDERS.mercadoPago,
              provider_payment_ref: providerPayment.providerPaymentId,
              external_id: providerPayment.providerPaymentId,
              payment_method: providerPayment.paymentMethod,
              paid_at: nextStatus === PaymentStatus.CAPTURED
                ? providerPayment.paidAt ?? new Date()
                : null,
            },
          });

      await tx.paymentTransaction.create({
        data: {
          payment_id: payment.id,
          action: `webhook:${event.event_type}`,
          provider_status: providerPayment.status,
          provider_response: buildProviderResponse(providerPayment),
          idempotency_key: event.provider_event_ref,
        },
      });

      if (nextStatus === PaymentStatus.CAPTURED) {
        await tx.userSubscription.updateMany({
          where: { id: subscriptionId, status: UserSubscriptionStatus.PENDING_PAYMENT },
          data: { status: UserSubscriptionStatus.ACTIVE },
        });
      }

      await auditRepository.emit(
        {
          eventType: auditEventForPaymentStatus(nextStatus),
          actor: { type: ActorType.SYSTEM, id: "mercadopago-webhook" },
          sourceApp: SourceApp.BACKEND,
          payload: {
            subscriptionId,
            paymentId: payment.id,
            providerPaymentId: providerPayment.providerPaymentId,
            providerStatus: providerPayment.status,
            nextStatus,
            webhookEventId: event.id,
          },
        },
        tx
      );
    }

    await tx.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed_at: new Date(), processing_error: null },
    });
  });

  if (!resolvedOrderId && !resolvedSubscriptionId) {
    throw new Error(`PAYMENT_REFERENCE_MISSING:${providerPaymentId}`);
  }

  if (shouldFinalizeOrder && resolvedOrderId) {
    await finishOrderAfterPaymentCaptured(resolvedOrderId);
  }

  return {
    ok: true,
    providerPaymentId,
    orderId: resolvedOrderId,
    subscriptionId: resolvedSubscriptionId,
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
