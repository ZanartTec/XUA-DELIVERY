import type {
  InventoryItemFilterInput,
  OpsInventoryBalanceQueryInput,
  OpsInventoryMovementQueryInput,
} from "@xua/shared/schemas/inventory";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import type { InventoryItemCatalogRow } from "../../inventory/repository/inventory.repository.js";
import { opsInventoryReadRepository } from "../repository/inventory-read.repository.js";
import type {
  OpsInventoryBalanceRow,
  OpsInventoryDistributorRow,
  OpsInventoryMovementRow,
} from "../repository/inventory-read.repository.js";

function toPeriodDate(value: string | undefined, boundary: "start" | "end"): Date | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const isStart = boundary === "start";
    date.setUTCHours(isStart ? 0 : 23, isStart ? 0 : 59, isStart ? 0 : 59, isStart ? 0 : 999);
  }

  return date;
}

function pagination(limit: number, offset: number, total: number) {
  return { limit, offset, total };
}

function isLowStock(row: OpsInventoryBalanceRow): boolean {
  const threshold = row.inventory_item.low_stock_threshold;
  return threshold !== null && row.quantity_on_hand <= threshold;
}

function toItem(row: OpsInventoryBalanceRow | OpsInventoryMovementRow) {
  return {
    id: row.inventory_item.id,
    code: row.inventory_item.code,
    name: row.inventory_item.name,
    type: row.inventory_item.type,
    unit_label: row.inventory_item.unit_label,
  };
}

function distributorResponse(row: OpsInventoryDistributorRow) {
  return {
    id: row.id,
    name: row.name,
  };
}

function inventoryItemResponse(item: InventoryItemCatalogRow) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    type: item.type,
    product_id: item.product_id,
    unit_label: item.unit_label,
    low_stock_threshold: item.low_stock_threshold,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function sanitizeMovementMetadata(metadata: unknown): Record<string, string | number | boolean | null> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const allowedKeys = [
    "origin",
    "batch_id",
    "batch_hash",
    "batch_version",
    "session_id",
    "snapshot_quantity",
    "current_quantity",
    "counted_quantity",
    "delta",
  ];
  const source = metadata as Record<string, unknown>;

  return allowedKeys.reduce<Record<string, string | number | boolean | null>>((safe, key) => {
    const value = source[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    }

    return safe;
  }, {});
}

function balanceResponse(row: OpsInventoryBalanceRow) {
  return {
    id: row.id,
    distributor_id: row.distributor_id,
    distributor_name: row.distributor.name,
    inventory_item_id: row.inventory_item_id,
    item: toItem(row),
    quantity_on_hand: row.quantity_on_hand,
    low_stock_threshold: row.inventory_item.low_stock_threshold,
    is_low_stock: isLowStock(row),
    last_movement_at: row.last_movement_at,
    updated_at: row.updated_at,
  };
}

function movementResponse(row: OpsInventoryMovementRow) {
  return {
    id: row.id,
    distributor_id: row.distributor_id,
    distributor_name: row.distributor.name,
    inventory_item_id: row.inventory_item_id,
    item: toItem(row),
    quantity_delta: row.quantity_delta,
    movement_type: row.movement_type,
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    source_app: row.source_app,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    metadata: sanitizeMovementMetadata(row.metadata),
    occurred_at: row.occurred_at,
  };
}

export const opsInventoryReadService = {
  async listDistributors() {
    const distributors = await opsInventoryReadRepository.listDistributors();
    return { distributors: distributors.map(distributorResponse) };
  },

  async listItems(query: InventoryItemFilterInput) {
    const { items, total } = await inventoryRepository.listInventoryItems({
      search: query.q,
      code: query.code,
      name: query.name,
      type: query.type,
      productId: query.product_id,
      isActive: query.is_active,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: items.map(inventoryItemResponse),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async listBalances(query: OpsInventoryBalanceQueryInput) {
    const { balances, total } = await opsInventoryReadRepository.listBalances({
      distributorId: query.distributor_id,
      inventoryItemId: query.inventory_item_id,
      ...(query.q ? { search: query.q } : {}),
      ...(query.item_type ? { itemType: query.item_type } : {}),
      ...(query.stock_status ? { stockStatus: query.stock_status } : {}),
      limit: query.limit,
      offset: query.offset,
    });

    return {
      balances: balances.map(balanceResponse),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async getBalance(id: string) {
    const balance = await opsInventoryReadRepository.findBalanceById(id);
    return balance ? { balance: balanceResponse(balance) } : null;
  },

  async listMovements(query: OpsInventoryMovementQueryInput) {
    const { movements, total } = await opsInventoryReadRepository.listMovements({
      distributorId: query.distributor_id,
      inventoryItemId: query.inventory_item_id,
      movementType: query.movement_type,
      start: toPeriodDate(query.start, "start"),
      end: toPeriodDate(query.end, "end"),
      limit: query.limit,
      offset: query.offset,
    });

    return {
      movements: movements.map(movementResponse),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async getMovement(id: string) {
    const movement = await opsInventoryReadRepository.findMovementById(id);
    return movement ? { movement: movementResponse(movement) } : null;
  },
};