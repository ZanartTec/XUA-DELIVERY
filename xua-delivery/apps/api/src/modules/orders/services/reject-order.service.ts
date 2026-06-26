import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, OrderStatus, PaymentKind, PaymentStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

/**
 * rejectOrderService — rejeição do pedido pela distribuidora.
 *
 * REJECTED_BY_DISTRIBUTOR é terminal na máquina de estados (sem reembolso ou
 * realocação automática). Para não deixar o gap invisível, sinalizamos no
 * próprio evento de auditoria quando havia pagamento capturado/autorizado no
 * momento da rejeição, para tratamento manual por ops (ver auditoria — achado 2.3).
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
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.REJECTED_BY_DISTRIBUTOR);

      // Pedido pago online já teve o pagamento capturado antes de chegar à
      // distribuidora (ver create-order/confirmOrder) — como REJECTED_BY_DISTRIBUTOR
      // não tem reembolso automático, sinalizamos para revisão manual de ops.
      const capturedPayment = await tx.payment.findFirst({
        where: {
          order_id: orderId,
          kind: PaymentKind.ORDER,
          status: { in: [PaymentStatus.CAPTURED, PaymentStatus.AUTHORIZED] },
        },
        orderBy: { created_at: "desc" },
      });

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
            requires_manual_refund_review: Boolean(capturedPayment),
            captured_payment_id: capturedPayment?.id ?? null,
          },
        },
        tx
      );

      if (capturedPayment) {
        log.warn(
          { orderId, paymentId: capturedPayment.id },
          "Order rejected by distributor with captured payment pending manual refund review"
        );
      }

      return updated;
    });

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.REJECTED_BY_DISTRIBUTOR,
    });
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.REJECTED_BY_DISTRIBUTOR);

    return order;
  },
};
