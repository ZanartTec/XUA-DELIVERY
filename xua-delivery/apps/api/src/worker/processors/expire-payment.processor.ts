import type { Job } from "bullmq";
import {
  ActorType,
  AuditEventType,
  OrderStatus,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";
import type { PaymentExpirationJobPayload } from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { getPrisma } from "../../infra/prisma/client";
import { auditRepository } from "../../modules/audit/audit.repository.js";
import { getIO } from "../../infra/socket/gateway.js";

const log = createLogger("expire-payment-worker");

const PENDING_PAYMENT_STATUSES = new Set<string>([
  PaymentStatus.CREATED,
  PaymentStatus.AUTHORIZED,
]);

const CANCELLABLE_ORDER_STATUSES = new Set<string>([
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_PENDING,
]);

type ExpirationResult =
  | { action: "skipped"; reason: string; status?: string; paymentStatus?: string }
  | {
      action: "expired";
      orderId: string;
      paymentId: string | undefined;
      consumerId: string;
    };

/**
 * Processa a expiração de pagamento de um pedido.
 *
 * Idempotência: múltiplas execuções são seguras —
 *   - Se o pedido já progrediu (CONFIRMED, SENT_TO_DISTRIBUTOR, etc.) → noop
 *   - Se o pedido já foi cancelado → noop
 *   - Se o pagamento já foi capturado/aprovado → noop
 *
 * Race condition com webhook: a transação Prisma interactive garante
 * serialização. Se o webhook altera o status antes, este job verá o
 * novo status e fará noop.
 */
export async function processPaymentExpiration(
  job: Job<PaymentExpirationJobPayload>
): Promise<ExpirationResult> {
  const { orderId, correlationId } = job.data;
  log.info({ orderId, correlationId, jobId: job.id }, "Payment expiration job started");

  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    // Busca pedido dentro da transação (serializada por Prisma interactive tx)
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      log.warn({ orderId }, "Order not found for expiration — skipping");
      return { action: "skipped" as const, reason: "order_not_found" };
    }

    // Pedido já foi pago, confirmado, ou cancelado → noop
    if (!CANCELLABLE_ORDER_STATUSES.has(order.status)) {
      log.info(
        { orderId, currentStatus: order.status },
        "Order already progressed beyond payment — skipping expiration"
      );
      return {
        action: "skipped" as const,
        reason: "order_already_progressed",
        status: order.status,
      };
    }

    // Busca pagamento mais recente do pedido
    const payment = await tx.payment.findFirst({
      where: { order_id: orderId },
      orderBy: { created_at: "desc" },
    });

    // Se pagamento já foi capturado/aprovado → noop
    if (payment && !PENDING_PAYMENT_STATUSES.has(payment.status)) {
      log.info(
        { orderId, paymentId: payment.id, paymentStatus: payment.status },
        "Payment already processed — skipping expiration"
      );
      return {
        action: "skipped" as const,
        reason: "payment_already_processed",
        paymentStatus: payment.status,
      };
    }

    // === EXPIRAR ===

    const minutes = Number(process.env.PAYMENT_EXPIRATION_MINUTES);
    const expirationMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
    const cancellationReason =
      `Pagamento não confirmado dentro do prazo de ${expirationMinutes} minutos`;

    // 1. Atualizar pagamento para EXPIRED (se existe)
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.EXPIRED },
      });
    }

    // 2. Cancelar pedido
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        payment_status: "expired",
        cancellation_reason: cancellationReason,
      },
    });

    // 3. Audit log
    // (Caução de vasilhames não é cancelada aqui: o empréstimo só ocorre na entrega,
    //  então um pedido expirado por falta de pagamento nunca terá caução a reverter.)
    await auditRepository.emit(
      {
        eventType: AuditEventType.PAYMENT_EXPIRED,
        actor: { type: ActorType.SYSTEM, id: "payment-expiration-worker" },
        orderId,
        sourceApp: SourceApp.BACKEND,
        payload: {
          correlationId,
          paymentId: payment?.id ?? null,
          previousOrderStatus: order.status,
          previousPaymentStatus: payment?.status ?? null,
          reason: cancellationReason,
        },
      },
      tx
    );

    log.info(
      {
        orderId,
        paymentId: payment?.id,
        correlationId,
      },
      "Order expired due to payment timeout"
    );

    return {
      action: "expired" as const,
      orderId,
      paymentId: payment?.id,
      consumerId: order.consumer_id,
    };
  }, { maxWait: 10_000, timeout: 15_000 });

  // Pós-commit: notificar consumer via Socket.IO
  if (result.action === "expired") {
    try {
      const io = getIO();
      io.to(`consumer:${result.consumerId}`).emit("order_status_changed", {
        orderId,
        status: OrderStatus.CANCELLED,
        reason: "payment_expired",
      });
    } catch {
      log.warn({ orderId }, "Failed to emit socket event for expired order");
    }
  }

  return result;
}
