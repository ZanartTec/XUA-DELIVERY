import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, InventoryMovementType, InventoryReferenceType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import { inventoryService } from "../../inventory/services/inventory.service.js";
import { depositSettlementService } from "../../deposits/services/deposit-settlement.service.js";
import { createLogger } from "../../../infra/logger/index.js";
import { OrderServiceError } from "../errors.js";
import { translateInventoryError } from "./order-inventory.helpers.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

/**
 * Status em que registrar vasilhame faz sentido.
 *
 * Aceita os dois lados da conclusão porque as duas ordens de operação convivem:
 * o app antigo confirma o código primeiro (pedido já DELIVERED) e o app novo
 * registra o vasilhame antes (pedido ainda OUT_FOR_DELIVERY). Qualquer outro
 * status é registro indevido — sem esta checagem era possível gravar vasilhame
 * de um pedido cancelado, recusado ou que sequer saiu para entrega.
 */
const BOTTLE_STEP_ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
]);

function assertBottleStepAllowed(status: string): void {
  if (!BOTTLE_STEP_ALLOWED_STATUSES.has(status)) {
    throw new OrderServiceError(
      "BOTTLE_STEP_INVALID_STATUS",
      "Pedido não está em uma etapa que permita registrar vasilhame"
    );
  }
}

/**
 * orderBottleService — registros de troca/não-coleta de vasilhame pelo motorista.
 */
export const orderBottleService = {
  /**
   * Registra troca de vasilhame
   */
  async recordBottleExchange(
    orderId: string,
    driverId: string,
    data: { collectedQty: number; returnedQty: number; condition?: string }
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.driver_id !== driverId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      assertBottleStepAllowed(current.status);

      let emptyReturnInventoryItem: Awaited<
        ReturnType<typeof inventoryRepository.findActiveReturnableEmptyItem>
      > = null;

      if (data.returnedQty > 0) {
        emptyReturnInventoryItem = await inventoryRepository.findActiveReturnableEmptyItem(tx);
        if (emptyReturnInventoryItem) {
          try {
            await inventoryService.applyMovement(
              {
                distributorId: current.distributor_id,
                inventoryItemId: emptyReturnInventoryItem.id,
                quantityDelta: data.returnedQty,
                movementType: InventoryMovementType.EMPTY_RETURN_IN,
                actor: { type: ActorType.DRIVER, id: driverId },
                sourceApp: SourceApp.DRIVER_WEB,
                reference: { type: InventoryReferenceType.ORDER, id: orderId },
                metadata: {
                  origin: "bottle_exchange",
                  order_id: orderId,
                  distributor_id: current.distributor_id,
                  driver_id: driverId,
                  returned_empty_qty: data.returnedQty,
                  collected_empty_qty: data.collectedQty,
                  bottle_condition: data.condition ?? null,
                  inventory_item_id: emptyReturnInventoryItem.id,
                  inventory_item_code: emptyReturnInventoryItem.code,
                },
              },
              tx
            );
          } catch (error) {
            translateInventoryError(error);
          }
        } else {
          log.warn(
            { orderId, distributorId: current.distributor_id, returnedQty: data.returnedQty },
            "Bottle exchange recorded without returnable empty inventory item"
          );
        }
      }

      const updated = await orderRepository.update(
        orderId,
        {
          collected_empty_qty: data.collectedQty,
          returned_empty_qty: data.returnedQty,
          bottle_condition: data.condition ?? null,
          bottle_step_recorded_at: new Date(),
        },
        tx
      );

      // Settlement de caução de vasilhames com contagem REAL da entrega:
      // empresta faltantes elegíveis e abate dívida com vazios excedentes.
      // Idempotente por order_id. Resolve vasilhames a partir dos itens (água→vasilhame).
      const orderItems = await orderRepository.findItemsByOrderId(orderId, tx);
      await depositSettlementService.settleDelivery(
        {
          orderId,
          distributorId: current.distributor_id,
          consumerId: current.consumer_id,
          items: orderItems,
          collectedEmpties: data.collectedQty,
          actor: { type: ActorType.DRIVER, id: driverId },
          sourceApp: SourceApp.DRIVER_WEB,
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.BOTTLE_EXCHANGE_RECORDED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: {
            ...data,
            inventory_movement_type:
              data.returnedQty > 0 && emptyReturnInventoryItem
                ? InventoryMovementType.EMPTY_RETURN_IN
                : null,
            inventory_item_id: emptyReturnInventoryItem?.id ?? null,
          },
        },
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Registra vasilhame não coletado
   */
  async recordEmptyNotCollected(
    orderId: string,
    driverId: string,
    data: { reason: string; notes?: string }
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.driver_id !== driverId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      assertBottleStepAllowed(current.status);

      const updated = await orderRepository.update(
        orderId,
        {
          empty_not_collected_reason: data.reason,
          empty_not_collected_notes: data.notes ?? null,
          bottle_step_recorded_at: new Date(),
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.EMPTY_NOT_COLLECTED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: data,
        },
        tx
      );

      return updated;
    });

    return order;
  },
};
