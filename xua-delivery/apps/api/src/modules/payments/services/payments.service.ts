import type { Prisma, Payment } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { auditRepository } from "../../audit/index.js";
import {
  getConfiguredPaymentProvider,
  getPaymentGateway,
  PAYMENT_PROVIDERS,
  type PaymentMethod,
} from "../gateway/payments.gateway.js";
import { createLogger } from "../../../infra/logger";
import { schedulePaymentExpiration } from "../../../infra/queue/payment-jobs.producer.js";

const log = createLogger("payments");

type TxClient = Prisma.TransactionClient;
type CheckoutPaymentMethod = Extract<PaymentMethod, "pix" | "credit">;

export class PaymentServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

function toPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case "captured":
      return PaymentStatus.CAPTURED;
    case "authorized":
      return PaymentStatus.AUTHORIZED;
    case "failed":
      return PaymentStatus.FAILED;
    default:
      return PaymentStatus.CREATED;
  }
}

function extractRedirectUrl(transactions: { provider_response: Prisma.JsonValue }[]): string | null {
  for (const transaction of transactions) {
    const response = transaction.provider_response;
    if (response && typeof response === "object" && !Array.isArray(response)) {
      const { redirectUrl } = response as Record<string, unknown>;
      if (typeof redirectUrl === "string" && redirectUrl.length > 0) {
        return redirectUrl;
      }
    }
  }
  return null;
}

export const paymentService = {
  async createCheckoutPayment(
    orderId: string,
    consumerId: string,
    paymentMethod: CheckoutPaymentMethod
  ): Promise<{
    payment: Payment;
    redirectUrl: string;
    preferenceId: string;
    status: PaymentStatus;
  }> {
    const prisma = getPrisma();
    const order = await prisma.order.findFirst({
      where: { id: orderId, consumer_id: consumerId },
      include: {
        consumer: { select: { email: true } },
        items: true,
      },
    });

    if (!order) {
      throw new PaymentServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
    }

    if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new PaymentServiceError(
        "INVALID_ORDER_STATUS",
        "Pedido não está disponível para pagamento"
      );
    }

    const existing = await prisma.payment.findFirst({
      where: {
        order_id: order.id,
        provider: PAYMENT_PROVIDERS.mercadoPago,
        status: { in: [PaymentStatus.CREATED, PaymentStatus.AUTHORIZED] },
      },
      orderBy: { created_at: "desc" },
      include: {
        transactions: { orderBy: { created_at: "desc" }, take: 5 },
      },
    });

    if (existing) {
      const redirectUrl = extractRedirectUrl(existing.transactions);
      if (redirectUrl && existing.external_id) {
        return {
          payment: existing,
          redirectUrl,
          preferenceId: existing.external_id,
          status: existing.status,
        };
      }
    }

    const idempotencyKey = `mp-checkout-pro:${order.id}:${paymentMethod}`;
    const gateway = getPaymentGateway();
    const result = await gateway.charge(order.total_cents, {
      orderId: order.id,
      kind: PaymentKind.ORDER,
      idempotencyKey,
      paymentMethod,
      payerEmail: order.consumer.email,
      description: `Pedido Xuá #${order.id.slice(0, 8)}`,
      items: order.items.map((item) => ({
        id: item.product_id,
        title: item.product_name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
      })),
    });

    if (!result.redirectUrl) {
      throw new PaymentServiceError(
        "PROVIDER_REDIRECT_MISSING",
        "Gateway não retornou URL de pagamento"
      );
    }

    const status = toPaymentStatus(result.status);
    const payment = await prisma.$transaction(async (tx: TxClient) => {
      if (order.status === OrderStatus.CREATED) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAYMENT_PENDING, payment_status: "pending" },
        });
      }

      const created = await tx.payment.create({
        data: {
          order_id: order.id,
          kind: PaymentKind.ORDER,
          amount_cents: order.total_cents,
          status,
          provider: PAYMENT_PROVIDERS.mercadoPago,
          provider_payment_ref: result.providerPaymentRef ?? result.externalId,
          external_id: result.externalId,
          idempotency_key: idempotencyKey,
          payment_method: paymentMethod,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          payment_id: created.id,
          action: "checkout_preference_created",
          provider_status: result.status,
          provider_response: {
            externalId: result.externalId,
            providerPaymentRef: result.providerPaymentRef,
            redirectUrl: result.redirectUrl,
            raw: result.raw,
          } as Prisma.InputJsonObject,
          idempotency_key: idempotencyKey,
        },
      });

      await auditRepository.emit(
        {
          eventType: AuditEventType.PAYMENT_CREATED,
          actor: { type: ActorType.SYSTEM, id: PAYMENT_PROVIDERS.mercadoPago },
          orderId: order.id,
          sourceApp: SourceApp.BACKEND,
          payload: {
            paymentId: created.id,
            preferenceId: result.externalId,
            paymentMethod,
            status,
          },
        },
        tx
      );

      return created;
    });

    log.info(
      { orderId: order.id, paymentId: payment.id, preferenceId: result.externalId },
      "Mercado Pago checkout preference created"
    );

    // Agenda expiração automática — 15 min sem pagamento = cancelamento
    schedulePaymentExpiration(order.id).catch((err) => {
      log.error({ orderId: order.id, err }, "Failed to schedule payment expiration");
    });

    return {
      payment,
      redirectUrl: result.redirectUrl,
      preferenceId: result.externalId,
      status,
    };
  },

  async getOrderPaymentStatus(orderId: string, consumerId: string) {
    const prisma = getPrisma();
    const order = await prisma.order.findFirst({
      where: { id: orderId, consumer_id: consumerId },
      select: {
        id: true,
        status: true,
        payment_status: true,
        total_cents: true,
        payments: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            amount_cents: true,
            provider: true,
            provider_payment_ref: true,
            external_id: true,
            paid_at: true,
            created_at: true,
          },
        },
      },
    });

    if (!order) {
      throw new PaymentServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
    }

    return {
      order: {
        id: order.id,
        status: order.status,
        payment_status: order.payment_status,
        total_cents: order.total_cents,
      },
      payment: order.payments[0] ?? null,
    };
  },

  /**
   * Cria cobrança via gateway e persiste registro de pagamento.
   * Mantido para o fluxo mock de desenvolvimento.
   */
  async charge(
    orderId: string,
    amountCents: number,
    kind: PaymentKind
  ): Promise<{ payment: Payment; gatewayResult: { externalId: string; status: string } }> {
    const gateway = getPaymentGateway();
    const provider = getConfiguredPaymentProvider();
    const result = await gateway.charge(amountCents, { orderId, kind });

    const prisma = getPrisma();
    const payment = await prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.payment.create({
        data: {
          order_id: orderId,
          kind,
          amount_cents: amountCents,
          status: toPaymentStatus(result.status),
          provider,
          provider_payment_ref: result.providerPaymentRef,
          external_id: result.externalId,
        },
      });

      const eventType =
        result.status === "captured"
          ? AuditEventType.PAYMENT_CAPTURED
          : AuditEventType.PAYMENT_CREATED;

      await auditRepository.emit(
        {
          eventType,
          actor: { type: ActorType.SYSTEM, id: "payment-gateway" },
          orderId,
          sourceApp: SourceApp.BACKEND,
          payload: { externalId: result.externalId, status: result.status },
        },
        tx
      );

      return created;
    });

    log.info({ orderId, amountCents, kind, externalId: result.externalId, status: result.status }, "Payment charged");
    return { payment, gatewayResult: result };
  },

  /**
   * Confirma pagamento — legado para gateways síncronos/mock.
   */
  async confirmPayment(orderId: string, externalId: string): Promise<Payment> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.payment.findFirst({
        where: { order_id: orderId, external_id: externalId },
      });
      if (!existing) throw new Error("PAYMENT_NOT_FOUND");

      const updated = await tx.payment.update({
        where: { id: existing.id },
        data: { status: PaymentStatus.CAPTURED, paid_at: new Date() },
      });

      await auditRepository.emit(
        {
          eventType: AuditEventType.PAYMENT_CAPTURED,
          actor: { type: ActorType.SYSTEM, id: "payment-webhook" },
          orderId,
          sourceApp: SourceApp.BACKEND,
        },
        tx
      );

      log.info({ orderId, externalId, paymentId: updated.id }, "Payment confirmed");
      return updated;
    });
  },

  /**
   * Reembolsa pagamento — usado em cancelamentos.
   */
  async refund(orderId: string): Promise<{ externalId: string; status: string } | null> {
    const prisma = getPrisma();
    const payment = await prisma.payment.findFirst({
      where: { order_id: orderId, status: PaymentStatus.CAPTURED },
    });
    if (!payment) return null;

    const gateway = getPaymentGateway();
    const providerPaymentId = payment.provider_payment_ref ?? payment.external_id;
    if (!providerPaymentId) return null;

    const result = await gateway.refund(providerPaymentId);

    if (result.status === "refunded") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
      log.info({ orderId, paymentId: payment.id }, "Payment refunded");
    }

    return result;
  },
};
