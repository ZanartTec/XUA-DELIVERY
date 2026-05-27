import type { Prisma } from "@prisma/client";
import type {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  InventoryItemType,
  SourceApp,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";

const DISTRIBUTOR_READ_SELECT = {
  id: true,
  name: true,
} as const;

const INVENTORY_ITEM_READ_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  unit_label: true,
  low_stock_threshold: true,
} as const;

export type OpsInventoryItemRead = {
  id: string;
  code: string;
  name: string;
  type: InventoryItemType;
  unit_label: string;
  low_stock_threshold: number | null;
};

export type OpsDistributorRead = {
  id: string;
  name: string;
};

export type OpsInventoryBalanceRow = {
  id: string;
  distributor_id: string;
  inventory_item_id: string;
  quantity_on_hand: number;
  last_movement_at: Date | null;
  updated_at: Date;
  distributor: OpsDistributorRead;
  inventory_item: OpsInventoryItemRead;
};

export type OpsInventoryMovementRow = {
  id: string;
  distributor_id: string;
  inventory_item_id: string;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  actor_type: ActorType;
  actor_id: string;
  source_app: SourceApp;
  reference_type: InventoryReferenceType | null;
  reference_id: string | null;
  metadata: Prisma.JsonValue;
  occurred_at: Date;
  distributor: OpsDistributorRead;
  inventory_item: OpsInventoryItemRead;
};

export type OpsInventoryReconciliationRow = {
  id: string;
  distributor_id: string;
  reconciliation_date: Date;
  full_out: number;
  empty_returned: number;
  delta: number;
  justification: string | null;
  closed_by: string;
  created_at: Date;
  distributor: OpsDistributorRead;
};

export type OpsInventoryBalanceListParams = {
  distributorId?: string;
  inventoryItemId?: string;
  limit: number;
  offset: number;
};

export type OpsInventoryMovementListParams = OpsInventoryBalanceListParams & {
  movementType?: InventoryMovementType;
  start?: Date;
  end?: Date;
};

export type OpsInventoryReconciliationListParams = {
  distributorId?: string;
  start?: Date;
  end?: Date;
  limit: number;
  offset: number;
};

export const opsInventoryReadRepository = {
  async listBalances(
    params: OpsInventoryBalanceListParams
  ): Promise<{ balances: OpsInventoryBalanceRow[]; total: number }> {
    const prisma = getPrisma();
    const where: Prisma.DistributorInventoryBalanceWhereInput = {
      ...(params.distributorId ? { distributor_id: params.distributorId } : {}),
      ...(params.inventoryItemId ? { inventory_item_id: params.inventoryItemId } : {}),
    };

    const [balances, total] = await Promise.all([
      prisma.distributorInventoryBalance.findMany({
        where,
        select: {
          id: true,
          distributor_id: true,
          inventory_item_id: true,
          quantity_on_hand: true,
          last_movement_at: true,
          updated_at: true,
          distributor: { select: DISTRIBUTOR_READ_SELECT },
          inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
        },
        orderBy: [{ distributor_id: "asc" }, { inventory_item_id: "asc" }],
        skip: params.offset,
        take: params.limit,
      }),
      prisma.distributorInventoryBalance.count({ where }),
    ]);

    return { balances, total };
  },

  async findBalanceById(id: string): Promise<OpsInventoryBalanceRow | null> {
    const prisma = getPrisma();
    return prisma.distributorInventoryBalance.findUnique({
      where: { id },
      select: {
        id: true,
        distributor_id: true,
        inventory_item_id: true,
        quantity_on_hand: true,
        last_movement_at: true,
        updated_at: true,
        distributor: { select: DISTRIBUTOR_READ_SELECT },
        inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
      },
    });
  },

  async listMovements(
    params: OpsInventoryMovementListParams
  ): Promise<{ movements: OpsInventoryMovementRow[]; total: number }> {
    const prisma = getPrisma();
    const where: Prisma.InventoryMovementWhereInput = {
      ...(params.distributorId ? { distributor_id: params.distributorId } : {}),
      ...(params.inventoryItemId ? { inventory_item_id: params.inventoryItemId } : {}),
      ...(params.movementType ? { movement_type: params.movementType } : {}),
      ...(params.start || params.end
        ? {
            occurred_at: {
              ...(params.start ? { gte: params.start } : {}),
              ...(params.end ? { lte: params.end } : {}),
            },
          }
        : {}),
    };

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        select: {
          id: true,
          distributor_id: true,
          inventory_item_id: true,
          quantity_delta: true,
          movement_type: true,
          actor_type: true,
          actor_id: true,
          source_app: true,
          reference_type: true,
          reference_id: true,
          metadata: true,
          occurred_at: true,
          distributor: { select: DISTRIBUTOR_READ_SELECT },
          inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
        },
        orderBy: [{ occurred_at: "desc" }, { id: "desc" }],
        skip: params.offset,
        take: params.limit,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { movements, total };
  },

  async findMovementById(id: string): Promise<OpsInventoryMovementRow | null> {
    const prisma = getPrisma();
    return prisma.inventoryMovement.findUnique({
      where: { id },
      select: {
        id: true,
        distributor_id: true,
        inventory_item_id: true,
        quantity_delta: true,
        movement_type: true,
        actor_type: true,
        actor_id: true,
        source_app: true,
        reference_type: true,
        reference_id: true,
        metadata: true,
        occurred_at: true,
        distributor: { select: DISTRIBUTOR_READ_SELECT },
        inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
      },
    });
  },

  async listReconciliations(
    params: OpsInventoryReconciliationListParams
  ): Promise<{ reconciliations: OpsInventoryReconciliationRow[]; total: number }> {
    const prisma = getPrisma();
    const where: Prisma.ReconciliationWhereInput = {
      ...(params.distributorId ? { distributor_id: params.distributorId } : {}),
      ...(params.start || params.end
        ? {
            reconciliation_date: {
              ...(params.start ? { gte: params.start } : {}),
              ...(params.end ? { lte: params.end } : {}),
            },
          }
        : {}),
    };

    const [reconciliations, total] = await Promise.all([
      prisma.reconciliation.findMany({
        where,
        select: {
          id: true,
          distributor_id: true,
          reconciliation_date: true,
          full_out: true,
          empty_returned: true,
          delta: true,
          justification: true,
          closed_by: true,
          created_at: true,
          distributor: { select: DISTRIBUTOR_READ_SELECT },
        },
        orderBy: [{ reconciliation_date: "desc" }, { id: "desc" }],
        skip: params.offset,
        take: params.limit,
      }),
      prisma.reconciliation.count({ where }),
    ]);

    return { reconciliations, total };
  },

  async findReconciliationById(id: string): Promise<OpsInventoryReconciliationRow | null> {
    const prisma = getPrisma();
    return prisma.reconciliation.findUnique({
      where: { id },
      select: {
        id: true,
        distributor_id: true,
        reconciliation_date: true,
        full_out: true,
        empty_returned: true,
        delta: true,
        justification: true,
        closed_by: true,
        created_at: true,
        distributor: { select: DISTRIBUTOR_READ_SELECT },
      },
    });
  },
};