import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, OrderStatus, PaymentKind, PaymentStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import { enqueueRefundPaymentJob } from "../../../infra/queue/payment-jobs.producer.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import {
  subscriptionSettlementService,
  type PersistentFailureNotice,
} from "../../user-subscriptions/services/subscription-settlement.service.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

/**
 * rejectOrderService — rejeição do pedido pela distribuidora.
 *
 * REJECTED_BY_DISTRIBUTOR é terminal na máquina de estados. Quando já havia
 * pagamento CAPTURED no momento da rejeição, o reembolso é disparado
 * automaticamente (fila `payment-refunds`, ver `payment-jobs.producer.ts`).
 * Pagamento apenas AUTHORIZED (sem captura) não tem void/cancelamento
 * implementado ainda — continua só sinalizado para revisão manual de ops.
 */
export const rejectOrderService = {
  /**
   * Distribuidor rejeita pedido: SENT_TO_DISTRIBUTOR → REJECTED_BY_DISTRIBUTOR
   */
  async rejectOrder(
    orderId: string,
    distributorUserId: string,
    reason: string,
    details?: string
  ): Promise<Order> {
    const prisma = getPrisma();
    let capturedPaymentId: string | null = null;
    let persistentFailureNotice: PersistentFailureNotice | null = null;

    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.REJECTED_BY_DISTRIBUTOR);

      // Pedido pago online já teve o pagamento capturado antes de chegar à
      // distribuidora (ver create-order/confirmOrder). CAPTURED → reembolso
      // automático (pós-commit); AUTHORIZED (sem captura) → sem void ainda,
      // fica sinalizado para revisão manual de ops.
      const pendingPayment = await tx.payment.findFirst({
        where: {
          order_id: orderId,
          kind: PaymentKind.ORDER,
          status: { in: [PaymentStatus.CAPTURED, PaymentStatus.AUTHORIZED] },
        },
        orderBy: { created_at: "desc" },
      });
      const isCaptured = pendingPayment?.status === PaymentStatus.CAPTURED;
      if (isCaptured) {
        capturedPaymentId = pendingPayment!.id;
      }

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.REJECTED_BY_DISTRIBUTOR,
        { cancellation_reason: reason },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: {
            reason,
            details,
            payment_id: pendingPayment?.id ?? null,
            refund_auto_initiated: isCaptured,
            requires_manual_refund_review: Boolean(pendingPayment) && !isCaptured,
          },
        },
        tx
      );

      if (pendingPayment && !isCaptured) {
        log.warn(
          { orderId, paymentId: pendingPayment.id, paymentStatus: pendingPayment.status },
          "Order rejected by distributor with authorized (uncaptured) payment pending manual refund review"
        );
      }

      // Compensação de assinatura (no-op se não for pedido de assinatura):
      // recredita o saldo e re-elegibiliza a entrega, ou marca FAILED no teto.
      persistentFailureNotice = await subscriptionSettlementService.settleFailed(tx, orderId);

      return updated;
    });

    if (persistentFailureNotice) {
      await subscriptionSettlementService.notifyPersistentFailure(persistentFailureNotice);
    }

    if (capturedPaymentId) {
      enqueueRefundPaymentJob(orderId, capturedPaymentId).catch((err) => {
        log.error({ orderId, paymentId: capturedPaymentId, err }, "Failed to enqueue payment refund job");
      });
    }

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.REJECTED_BY_DISTRIBUTOR,
    });
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.REJECTED_BY_DISTRIBUTOR);

    return order;
  },
};
