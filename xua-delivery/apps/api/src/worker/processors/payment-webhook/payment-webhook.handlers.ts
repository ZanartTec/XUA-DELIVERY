import type { Payment, PaymentWebhookEvent, Prisma } from "@prisma/client";
import {
  ActorType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
  UserSubscriptionStatus,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { enqueueSubscriptionGeneration } from "../../../infra/queue/subscription-jobs.producer.js";
import { auditRepository } from "../../../modules/audit/index.js";
import { orderService } from "../../../modules/orders/index.js";
import {
  PAYMENT_PROVIDERS,
  type ProviderPaymentDetails,
} from "../../../modules/payments/gateway/payments.gateway.js";
import {
  assertPaymentAmountMatches,
  auditEventForPaymentStatus,
  isInvalidRegression,
  paymentStatusToOrderPaymentStatus,
} from "./payment-webhook.status.js";
import type {
  PaymentTarget,
  PaymentTargetKind,
  PaymentTargetProcessingOutcome,
} from "./payment-webhook.types.js";

interface ProcessPaymentTargetInput {
  tx: Prisma.TransactionClient;
  event: PaymentWebhookEvent;
  target: PaymentTarget;
  existingPayment: Payment | null;
  providerPayment: ProviderPaymentDetails;
  nextStatus: PaymentStatus;
}

interface PaymentTargetHandler {
  findPayment(
    tx: Prisma.TransactionClient,
    target: PaymentTarget,
    existingPayment: Payment | null
  ): Promise<Payment | null>;
  assertAmount(
    tx: Prisma.TransactionClient,
    target: PaymentTarget,
    payment: Payment | null,
    providerPayment: ProviderPaymentDetails,
    nextStatus: PaymentStatus
  ): Promise<void>;
  savePayment(
    tx: Prisma.TransactionClient,
    target: PaymentTarget,
    payment: Payment | null,
    providerPayment: ProviderPaymentDetails,
    nextStatus: PaymentStatus
  ): Promise<Payment>;
  applyDomainState(
    tx: Prisma.TransactionClient,
    target: PaymentTarget,
    payment: Payment,
    nextStatus: PaymentStatus
  ): Promise<void>;
  emitAudit(
    tx: Prisma.TransactionClient,
    target: PaymentTarget,
    payment: Payment,
    providerPayment: ProviderPaymentDetails,
    nextStatus: PaymentStatus,
    event: PaymentWebhookEvent
  ): Promise<void>;
  shouldFinalize(nextStatus: PaymentStatus): boolean;
  finalize?(target: PaymentTarget): Promise<void>;
}

const TARGET_OUTCOMES: Record<
  PaymentTargetKind,
  (target: PaymentTarget, extra: Pick<PaymentTargetProcessingOutcome, "shouldFinalize" | "webhookMarkedProcessed">) => PaymentTargetProcessingOutcome
> = {
  [PaymentKind.ORDER]: (target, extra) => ({
    target,
    orderId: target.id,
    subscriptionId: null,
    ...extra,
  }),
  [PaymentKind.SUBSCRIPTION]: (target, extra) => ({
    target,
    orderId: null,
    subscriptionId: target.id,
    ...extra,
  }),
};

function paymentUpdateData(
  payment: Payment,
  providerPayment: ProviderPaymentDetails,
  nextStatus: PaymentStatus
): Prisma.PaymentUncheckedUpdateInput {
  return {
    status: nextStatus,
    provider_payment_ref: providerPayment.providerPaymentId,
    payment_method: providerPayment.paymentMethod ?? payment.payment_method,
    paid_at: nextStatus === PaymentStatus.CAPTURED
      ? providerPayment.paidAt ?? new Date()
      : payment.paid_at,
  };
}

function basePaymentCreateData(
  providerPayment: ProviderPaymentDetails,
  nextStatus: PaymentStatus,
  kind: PaymentKind
): Prisma.PaymentUncheckedCreateInput {
  return {
    kind,
    amount_cents: providerPayment.amountCents,
    status: nextStatus,
    provider: PAYMENT_PROVIDERS.mercadoPago,
    provider_payment_ref: providerPayment.providerPaymentId,
    external_id: providerPayment.providerPaymentId,
    payment_method: providerPayment.paymentMethod,
    paid_at: nextStatus === PaymentStatus.CAPTURED
      ? providerPayment.paidAt ?? new Date()
      : null,
  };
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

async function createPaymentTransactionOnce(
  tx: Prisma.TransactionClient,
  params: {
    paymentId: string;
    eventType: string;
    eventRef: string;
    providerPayment: ProviderPaymentDetails;
  }
): Promise<boolean> {
  const existing = await tx.paymentTransaction.findFirst({
    where: { payment_id: params.paymentId, idempotency_key: params.eventRef },
    select: { id: true },
  });
  if (existing) return false;

  await tx.paymentTransaction.create({
    data: {
      payment_id: params.paymentId,
      action: `webhook:${params.eventType}`,
      provider_status: params.providerPayment.status,
      provider_response: buildProviderResponse(params.providerPayment),
      idempotency_key: params.eventRef,
    },
  });

  return true;
}

async function markStatusRegression(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<void> {
  await tx.paymentWebhookEvent.update({
    where: { id: eventId },
    data: { processed_at: new Date(), processing_error: "IGNORED_STATUS_REGRESSION" },
  });
}

async function finishOrderAfterPaymentCaptured(target: PaymentTarget): Promise<void> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id: target.id } });
  if (!order) return;

  if (order.status === OrderStatus.PAYMENT_PENDING) {
    await orderService.confirmOrder(target.id);
  }

  const updated = await prisma.order.findUnique({ where: { id: target.id } });
  if (updated?.status === OrderStatus.CONFIRMED) {
    await orderService.sendToDistributor(target.id);
  }
}

/**
 * Pós-ativação da assinatura: dispara a geração direcionada dos pedidos das
 * entregas já elegíveis (data <= hoje), sem esperar o cron (D4). Idempotente —
 * a geração usa lock + guard order_id, então reexecuções não duplicam.
 */
async function generateSubscriptionOrdersAfterActivation(target: PaymentTarget): Promise<void> {
  await enqueueSubscriptionGeneration(target.id);
}

const ORDER_PAYMENT_HANDLER: PaymentTargetHandler = {
  async findPayment(tx, target, existingPayment) {
    return existingPayment?.order_id === target.id
      ? existingPayment
      : tx.payment.findFirst({
          where: { order_id: target.id, provider: PAYMENT_PROVIDERS.mercadoPago },
          orderBy: { created_at: "desc" },
        });
  },
  async assertAmount(tx, target, payment, providerPayment, nextStatus) {
    if (payment) {
      assertPaymentAmountMatches(payment.amount_cents, providerPayment, nextStatus);
      return;
    }

    const order = await tx.order.findUnique({
      where: { id: target.id },
      select: { total_cents: true },
    });
    if (order) assertPaymentAmountMatches(order.total_cents, providerPayment, nextStatus);
  },
  async savePayment(tx, target, payment, providerPayment, nextStatus) {
    if (payment) {
      return tx.payment.update({
        where: { id: payment.id },
        data: paymentUpdateData(payment, providerPayment, nextStatus),
      });
    }

    return tx.payment.create({
      data: {
        ...basePaymentCreateData(providerPayment, nextStatus, PaymentKind.ORDER),
        order_id: target.id,
      },
    });
  },
  async applyDomainState(tx, target, _payment, nextStatus) {
    await tx.order.update({
      where: { id: target.id },
      data: { payment_status: paymentStatusToOrderPaymentStatus(nextStatus) },
    });
  },
  async emitAudit(tx, target, payment, providerPayment, nextStatus, event) {
    await auditRepository.emit(
      {
        eventType: auditEventForPaymentStatus(nextStatus),
        actor: { type: ActorType.SYSTEM, id: "mercadopago-webhook" },
        orderId: target.id,
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
  },
  shouldFinalize: (nextStatus) => nextStatus === PaymentStatus.CAPTURED,
  finalize: finishOrderAfterPaymentCaptured,
};

const SUBSCRIPTION_PAYMENT_HANDLER: PaymentTargetHandler = {
  async findPayment(tx, target, existingPayment) {
    return existingPayment?.user_subscription_id === target.id
      ? existingPayment
      : tx.payment.findFirst({
          where: {
            user_subscription_id: target.id,
            provider: PAYMENT_PROVIDERS.mercadoPago,
          },
          orderBy: { created_at: "desc" },
        });
  },
  async assertAmount(_tx, _target, payment, providerPayment, nextStatus) {
    assertPaymentAmountMatches(payment?.amount_cents ?? 0, providerPayment, nextStatus);
  },
  async savePayment(tx, target, payment, providerPayment, nextStatus) {
    if (payment) {
      return tx.payment.update({
        where: { id: payment.id },
        data: paymentUpdateData(payment, providerPayment, nextStatus),
      });
    }

    return tx.payment.create({
      data: {
        ...basePaymentCreateData(providerPayment, nextStatus, PaymentKind.SUBSCRIPTION),
        user_subscription_id: target.id,
      },
    });
  },
  async applyDomainState(tx, target, _payment, nextStatus) {
    if (nextStatus !== PaymentStatus.CAPTURED) return;

    await tx.userSubscription.updateMany({
      where: { id: target.id, status: UserSubscriptionStatus.PENDING_PAYMENT },
      data: { status: UserSubscriptionStatus.ACTIVE },
    });
  },
  async emitAudit(tx, target, payment, providerPayment, nextStatus, event) {
    await auditRepository.emit(
      {
        eventType: auditEventForPaymentStatus(nextStatus),
        actor: { type: ActorType.SYSTEM, id: "mercadopago-webhook" },
        sourceApp: SourceApp.BACKEND,
        payload: {
          subscriptionId: target.id,
          paymentId: payment.id,
          providerPaymentId: providerPayment.providerPaymentId,
          providerStatus: providerPayment.status,
          nextStatus,
          webhookEventId: event.id,
        },
      },
      tx
    );
  },
  // Na captura do pagamento, dispara a geração direcionada dos pedidos (D4).
  shouldFinalize: (nextStatus) => nextStatus === PaymentStatus.CAPTURED,
  finalize: generateSubscriptionOrdersAfterActivation,
};

const PAYMENT_TARGET_HANDLERS: Record<PaymentTargetKind, PaymentTargetHandler> = {
  [PaymentKind.ORDER]: ORDER_PAYMENT_HANDLER,
  [PaymentKind.SUBSCRIPTION]: SUBSCRIPTION_PAYMENT_HANDLER,
};

function buildOutcome(
  target: PaymentTarget,
  extra: Pick<PaymentTargetProcessingOutcome, "shouldFinalize" | "webhookMarkedProcessed">
): PaymentTargetProcessingOutcome {
  return TARGET_OUTCOMES[target.kind](target, extra);
}

export async function processPaymentTarget({
  tx,
  event,
  target,
  existingPayment,
  providerPayment,
  nextStatus,
}: ProcessPaymentTargetInput): Promise<PaymentTargetProcessingOutcome> {
  const handler = PAYMENT_TARGET_HANDLERS[target.kind];
  const paymentBeforeWebhook = await handler.findPayment(tx, target, existingPayment);

  await handler.assertAmount(tx, target, paymentBeforeWebhook, providerPayment, nextStatus);

  if (paymentBeforeWebhook && isInvalidRegression(paymentBeforeWebhook.status, nextStatus)) {
    await markStatusRegression(tx, event.id);
    return buildOutcome(target, { shouldFinalize: false, webhookMarkedProcessed: true });
  }

  const payment = await handler.savePayment(
    tx,
    target,
    paymentBeforeWebhook,
    providerPayment,
    nextStatus
  );
  const transactionCreated = await createPaymentTransactionOnce(tx, {
    paymentId: payment.id,
    eventType: event.event_type,
    eventRef: event.provider_event_ref,
    providerPayment,
  });

  await handler.applyDomainState(tx, target, payment, nextStatus);
  if (transactionCreated) {
    await handler.emitAudit(tx, target, payment, providerPayment, nextStatus, event);
  }

  return buildOutcome(target, {
    shouldFinalize: handler.shouldFinalize(nextStatus),
    webhookMarkedProcessed: false,
  });
}

export async function finalizePaymentTarget(
  outcome: PaymentTargetProcessingOutcome
): Promise<void> {
  if (!outcome.shouldFinalize) return;
  await PAYMENT_TARGET_HANDLERS[outcome.target.kind].finalize?.(outcome.target);
}
