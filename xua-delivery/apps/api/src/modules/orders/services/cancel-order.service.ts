import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, InventoryMovementType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { OrderServiceError } from "../errors.js";
import {
  assertTransition,
  CANCEL_AUTO_RETURN_STATUSES,
  CANCEL_EXPLICIT_RETURN_STATUSES,
} from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import {
  applyOrderInventoryMovements,
  inventoryAuditLines,
  resolveOrderInventoryLines,
} from "./order-inventory.helpers.js";

type TxClient = Prisma.TransactionClient;

type StockReturnOptions = {
  returnToStock?: boolean;
};

function shouldReturnCancelledOrderToStock(
  previousStatus: string,
  options: StockReturnOptions | undefined,
  actorType: "consumer" | "ops" | "distributor" | "driver"
): boolean {
  if (options?.returnToStock === false) return false;
  if (options?.returnToStock === true) {
    // Pedido já está em poder do motorista: só a distribuidora pode confirmar
    // que o produto físico de fato retornou. Não confiamos na alegação do
    // próprio ator (consumer/driver/ops) que está cancelando — evita creditar
    // estoque de volta sem confirmação física real.
    if (previousStatus === OrderStatus.OUT_FOR_DELIVERY && actorType !== "distributor") {
      return false;
    }
    return CANCEL_EXPLICIT_RETURN_STATUSES.has(previousStatus);
  }
  return CANCEL_AUTO_RETURN_STATUSES.has(previousStatus);
}

/**
 * cancelOrderService — cancelamento do pedido por qualquer ator autorizado.
 */
export const cancelOrderService = {
  async cancelOrder(
    orderId: string,
    actorId: string,
    actorType: "consumer" | "ops" | "distributor" | "driver",
    reason: string,
    options?: StockReturnOptions
  ): Promise<Order> {
    const actorMap: Record<string, ActorType> = {
      consumer: ActorType.CONSUMER,
      ops: ActorType.OPS,
      distributor: ActorType.DISTRIBUTOR_USER,
      driver: ActorType.DRIVER,
    };
    const sourceAppMap: Record<string, SourceApp> = {
      consumer: SourceApp.CONSUMER_WEB,
      ops: SourceApp.OPS_CONSOLE,
      distributor: SourceApp.DISTRIBUTOR_WEB,
      driver: SourceApp.DRIVER_WEB,
    };
    const actor = actorMap[actorType];
    const sourceApp = sourceAppMap[actorType];

    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.CANCELLED);

      const shouldReturnToStock = shouldReturnCancelledOrderToStock(current.status, options, actorType);
      const inventoryLines = shouldReturnToStock
        ? await resolveOrderInventoryLines(current, tx)
        : [];

      if (shouldReturnToStock) {
        await applyOrderInventoryMovements({
          order: current,
          lines: inventoryLines,
          movementType: InventoryMovementType.ORDER_CANCEL_RETURN,
          quantityDirection: 1,
          actor: { type: actor, id: actorId },
          sourceApp,
          metadata: {
            origin: "order_cancellation_return",
            previous_status: current.status,
            new_status: OrderStatus.CANCELLED,
            reason,
            physical_return_confirmed: true,
          },
          tx,
        });
      }

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.CANCELLED,
        { cancellation_reason: reason },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CANCELLED,
          actor: { type: actor, id: actorId },
          orderId,
          sourceApp,
          payload: {
            reason,
            previous_status: current.status,
            physical_return_confirmed: shouldReturnToStock,
            inventory_movement_type: shouldReturnToStock
              ? InventoryMovementType.ORDER_CANCEL_RETURN
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
      status: OrderStatus.CANCELLED,
    });

    return order;
  },
};
