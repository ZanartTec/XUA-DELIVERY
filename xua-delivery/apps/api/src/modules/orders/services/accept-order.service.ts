import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, InventoryMovementType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import {
  applyOrderInventoryMovements,
  assertStockAvailableForOrder,
  inventoryAuditLines,
  resolveOrderInventoryLines,
} from "./order-inventory.helpers.js";

type TxClient = Prisma.TransactionClient;

/**
 * acceptOrderService — aceite do pedido pela distribuidora, com baixa de estoque.
 */
export const acceptOrderService = {
  /**
   * Distribuidor aceita pedido: SENT_TO_DISTRIBUTOR → ACCEPTED_BY_DISTRIBUTOR
   */
  async acceptOrder(orderId: string, distributorUserId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.ACCEPTED_BY_DISTRIBUTOR);

      const inventoryLines = await resolveOrderInventoryLines(current, tx);
      await assertStockAvailableForOrder(current, inventoryLines, tx);

      await applyOrderInventoryMovements({
        order: current,
        lines: inventoryLines,
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        quantityDirection: -1,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        metadata: {
          origin: "order_acceptance",
          previous_status: current.status,
          new_status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
        },
        tx,
      });

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
        { accepted_at: new Date() },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: {
            inventory_movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
            inventory_items: inventoryAuditLines(inventoryLines),
          },
        },
        tx
      );

      return updated;
    });

    // Socket.io SOMENTE após commit (seção 3.3)
    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    });
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.ACCEPTED_BY_DISTRIBUTOR);

    return order;
  },
};
