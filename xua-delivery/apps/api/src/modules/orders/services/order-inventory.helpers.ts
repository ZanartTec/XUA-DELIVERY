import type { Prisma } from "@prisma/client";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import { inventoryService, InventoryServiceError } from "../../inventory/services/inventory.service.js";
import { createLogger } from "../../../infra/logger/index.js";
import type { OrderWithItems } from "../repository/orders.repository.js";
import { OrderServiceError } from "../errors.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

export type OrderInventoryLine = {
  productId: string;
  productName: string;
  quantity: number;
  inventoryItemId: string;
  inventoryItemCode: string;
  inventoryItemName: string;
};

export function translateInventoryError(error: unknown): never {
  if (error instanceof InventoryServiceError) {
    throw new OrderServiceError(error.code, error.message);
  }

  throw error;
}

function aggregateOrderItems(order: OrderWithItems): Array<{
  productId: string;
  productName: string;
  quantity: number;
}> {
  const byProduct = new Map<string, { productId: string; productName: string; quantity: number }>();

  for (const item of order.items) {
    const current = byProduct.get(item.product_id);
    if (current) {
      current.quantity += item.quantity;
      continue;
    }

    byProduct.set(item.product_id, {
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
    });
  }

  return [...byProduct.values()];
}

export async function resolveOrderInventoryLines(
  order: OrderWithItems,
  tx: TxClient
): Promise<OrderInventoryLine[]> {
  const lines = aggregateOrderItems(order);
  if (lines.length === 0) {
    throw new OrderServiceError("ORDER_ITEM_NOT_FOUND", "Pedido sem itens para movimentar estoque");
  }

  const inventoryItems = await inventoryRepository.findActiveInventoryItemsByProductIds(
    lines.map((line) => line.productId),
    tx
  );

  const inventoryItemsByProduct = new Map<string, typeof inventoryItems>();
  for (const inventoryItem of inventoryItems) {
    if (!inventoryItem.product_id) continue;
    inventoryItemsByProduct.set(inventoryItem.product_id, [
      ...(inventoryItemsByProduct.get(inventoryItem.product_id) ?? []),
      inventoryItem,
    ]);
  }

  return lines.map((line) => {
    const mappedItems = inventoryItemsByProduct.get(line.productId) ?? [];

    if (mappedItems.length === 0) {
      log.warn(
        { orderId: order.id, distributorId: order.distributor_id, productId: line.productId },
        "Order inventory mapping missing"
      );
      throw new OrderServiceError(
        "INVENTORY_ITEM_NOT_FOUND",
        "Produto sem item de estoque ativo vinculado"
      );
    }

    if (mappedItems.length > 1) {
      log.warn(
        {
          orderId: order.id,
          distributorId: order.distributor_id,
          productId: line.productId,
          inventoryItemIds: mappedItems.map((item) => item.id),
        },
        "Order inventory mapping is ambiguous"
      );
      throw new OrderServiceError(
        "INVENTORY_ITEM_CONFLICT",
        "Produto vinculado a mais de um item de estoque ativo"
      );
    }

    const inventoryItem = mappedItems[0];
    return {
      ...line,
      inventoryItemId: inventoryItem.id,
      inventoryItemCode: inventoryItem.code,
      inventoryItemName: inventoryItem.name,
    };
  });
}

export async function assertStockAvailableForOrder(
  order: OrderWithItems,
  lines: OrderInventoryLine[],
  tx: TxClient
): Promise<void> {
  for (const line of lines) {
    const balance = await inventoryRepository.findBalanceForUpdate(
      order.distributor_id,
      line.inventoryItemId,
      tx
    );
    const quantityOnHand = balance?.quantity_on_hand ?? 0;

    if (quantityOnHand < line.quantity) {
      log.warn(
        {
          orderId: order.id,
          distributorId: order.distributor_id,
          productId: line.productId,
          inventoryItemId: line.inventoryItemId,
          requestedQuantity: line.quantity,
          quantityOnHand,
        },
        "Order acceptance rejected because stock is unavailable"
      );

      throw new OrderServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente para aceitar pedido");
    }
  }
}

export async function applyOrderInventoryMovements(params: {
  order: OrderWithItems;
  lines: OrderInventoryLine[];
  movementType: InventoryMovementType;
  quantityDirection: 1 | -1;
  actor: { type: ActorType; id: string };
  sourceApp: SourceApp;
  metadata: Record<string, unknown>;
  tx: TxClient;
}): Promise<void> {
  for (const line of params.lines) {
    try {
      await inventoryService.applyMovement(
        {
          distributorId: params.order.distributor_id,
          inventoryItemId: line.inventoryItemId,
          quantityDelta: params.quantityDirection * line.quantity,
          movementType: params.movementType,
          actor: params.actor,
          sourceApp: params.sourceApp,
          reference: { type: InventoryReferenceType.ORDER, id: params.order.id },
          metadata: {
            ...params.metadata,
            order_id: params.order.id,
            distributor_id: params.order.distributor_id,
            product_id: line.productId,
            product_name: line.productName,
            inventory_item_id: line.inventoryItemId,
            inventory_item_code: line.inventoryItemCode,
            quantity: line.quantity,
          },
        },
        params.tx
      );
    } catch (error) {
      translateInventoryError(error);
    }
  }
}

export function inventoryAuditLines(lines: OrderInventoryLine[]) {
  return lines.map((line) => ({
    product_id: line.productId,
    inventory_item_id: line.inventoryItemId,
    quantity: line.quantity,
  }));
}
