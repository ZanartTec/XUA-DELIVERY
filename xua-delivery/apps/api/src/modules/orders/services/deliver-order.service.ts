import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  InventoryMovementType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";
import { CASH_PAYMENT_METHOD } from "@xua/shared/mappers/payment";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { notificationService } from "../../notifications/services/notification.service.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import {
  applyOrderInventoryMovements,
  inventoryAuditLines,
  resolveOrderInventoryLines,
} from "./order-inventory.helpers.js";
import {
  CASH_PAYMENT_CAPTURABLE_STATUSES,
  CASH_PAYMENT_INVALID_CAPTURE_STATUSES,
  PAYMENT_PAID_STATUS,
} from "./payment-constants.js";
import { subscriptionSettlementService } from "../../user-subscriptions/services/subscription-settlement.service.js";

type TxClient = Prisma.TransactionClient;

type StockReturnOptions = {
  returnToStock?: boolean;
};

/**
 * deliverOrderService — desfechos da entrega: sucesso, falha e reagendamento.
 */
export const deliverOrderService = {
  /**
   * Entrega pedido: OUT_FOR_DELIVERY → DELIVERED
   */
  async deliverOrder(orderId: string, driverId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.DELIVERED);

      const cashPayment = await tx.payment.findFirst({
        where: {
          order_id: orderId,
          kind: PaymentKind.ORDER,
          payment_method: CASH_PAYMENT_METHOD,
        },
        orderBy: { created_at: "desc" },
      });

      if (cashPayment && CASH_PAYMENT_INVALID_CAPTURE_STATUSES.has(cashPayment.status)) {
        throw new OrderServiceError(
          "CASH_PAYMENT_INVALID",
          "Pagamento em dinheiro não está disponível para captura"
        );
      }

      const deliveredAt = new Date();

      if (cashPayment && CASH_PAYMENT_CAPTURABLE_STATUSES.has(cashPayment.status)) {
        await tx.payment.update({
          where: { id: cashPayment.id },
          data: { status: PaymentStatus.CAPTURED, paid_at: deliveredAt },
        });

        await auditRepository.emit(
          {
            eventType: AuditEventType.PAYMENT_CAPTURED,
            actor: { type: ActorType.DRIVER, id: driverId },
            orderId,
            sourceApp: SourceApp.DRIVER_WEB,
            payload: {
              payment_id: cashPayment.id,
              payment_method: CASH_PAYMENT_METHOD,
              amount_cents: cashPayment.amount_cents,
            },
          },
          tx
        );
      }

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.DELIVERED,
        {
          delivered_at: deliveredAt,
          ...(cashPayment ? { payment_status: PAYMENT_PAID_STATUS } : {}),
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
        },
        tx
      );

      // Compensação de assinatura (no-op se não for pedido de assinatura):
      // entrega concluída → SubscriptionDeliveryDate DELIVERED.
      await subscriptionSettlementService.settleDelivered(tx, orderId);

      return updated;
    });

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERED,
    });

    // Push notification
    notificationService
      .send(order.consumer_id, "Pedido entregue!", "Seu pedido foi entregue com sucesso.")
      .catch(() => {});

    return order;
  },

  /**
   * Registra falha na entrega: OUT_FOR_DELIVERY → DELIVERY_FAILED
   */
  async markDeliveryFailed(
    orderId: string,
    driverId: string,
    reason: string,
    options?: StockReturnOptions
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.DELIVERY_FAILED);

      const shouldReturnToStock = options?.returnToStock === true;
      const inventoryLines = shouldReturnToStock
        ? await resolveOrderInventoryLines(current, tx)
        : [];

      if (shouldReturnToStock) {
        await applyOrderInventoryMovements({
          order: current,
          lines: inventoryLines,
          movementType: InventoryMovementType.DELIVERY_FAILED_RETURN,
          quantityDirection: 1,
          actor: { type: ActorType.DRIVER, id: driverId },
          sourceApp: SourceApp.DRIVER_WEB,
          metadata: {
            origin: "delivery_failed_return",
            previous_status: current.status,
            new_status: OrderStatus.DELIVERY_FAILED,
            reason,
            physical_return_confirmed: true,
          },
          tx,
        });
      }

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.DELIVERY_FAILED,
        { cancellation_reason: reason },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CANCELLED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: {
            reason,
            type: "DELIVERY_FAILED",
            physical_return_confirmed: shouldReturnToStock,
            inventory_movement_type: shouldReturnToStock
              ? InventoryMovementType.DELIVERY_FAILED_RETURN
              : null,
            inventory_items: inventoryAuditLines(inventoryLines),
          },
        },
        tx
      );

      return updated;
    });

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERY_FAILED,
    });

    return order;
  },

  /**
   * Agenda reentrega: DELIVERY_FAILED → REDELIVERY_SCHEDULED
   */
  async scheduleRedelivery(orderId: string, opsUserId: string, newDate: Date): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.REDELIVERY_SCHEDULED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.REDELIVERY_SCHEDULED,
        { delivery_date: newDate },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CONFIRMED,
          actor: { type: ActorType.OPS, id: opsUserId },
          orderId,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { newDate: newDate.toISOString(), type: "REDELIVERY_SCHEDULED" },
        },
        tx
      );

      return updated;
    });

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.REDELIVERY_SCHEDULED,
    });

    return order;
  },
};
