import type {
  OpsInventoryBalanceQueryInput,
  OpsInventoryMovementQueryInput,
  OpsInventoryReconciliationQueryInput,
} from "@xua/shared/schemas/inventory";
import { opsInventoryReadRepository } from "../repository/inventory-read.repository.js";
import type {
  OpsInventoryBalanceRow,
  OpsInventoryMovementRow,
  OpsInventoryReconciliationRow,
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

function sanitizeMovementMetadata(metadata: unknown): Record<string, string | number | boolean | null> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const allowedKeys = ["origin", "batch_id", "batch_hash", "batch_version"];
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

function reconciliationResponse(row: OpsInventoryReconciliationRow) {
  return {
    id: row.id,
    distributor_id: row.distributor_id,
    distributor_name: row.distributor.name,
    reconciliation_date: row.reconciliation_date,
    full_out: row.full_out,
    empty_returned: row.empty_returned,
    delta: row.delta,
    justification: row.justification,
    closed_by: row.closed_by,
    created_at: row.created_at,
  };
}

export const opsInventoryReadService = {
  async listBalances(query: OpsInventoryBalanceQueryInput) {
    const { balances, total } = await opsInventoryReadRepository.listBalances({
      distributorId: query.distributor_id,
      inventoryItemId: query.inventory_item_id,
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

  async listReconciliations(query: OpsInventoryReconciliationQueryInput) {
    const { reconciliations, total } = await opsInventoryReadRepository.listReconciliations({
      distributorId: query.distributor_id,
      start: toPeriodDate(query.start, "start"),
      end: toPeriodDate(query.end, "end"),
      limit: query.limit,
      offset: query.offset,
    });

    return {
      reconciliations: reconciliations.map(reconciliationResponse),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async getReconciliation(id: string) {
    const reconciliation = await opsInventoryReadRepository.findReconciliationById(id);
    return reconciliation ? { reconciliation: reconciliationResponse(reconciliation) } : null;
  },
};