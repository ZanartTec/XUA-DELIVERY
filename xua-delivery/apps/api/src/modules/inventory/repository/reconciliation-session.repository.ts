import { Prisma } from "@prisma/client";
import type {
  InventoryItemType,
  InventoryReconciliationStatus,
} from "@xua/shared/enums";
import { InventoryReconciliationStatus as InventoryReconciliationStatusValue } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import type { TxClient } from "./inventory.repository.js";

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

const ADJUSTMENT_MOVEMENT_SELECT = {
  id: true,
  quantity_delta: true,
  occurred_at: true,
} as const;

const SESSION_ITEM_SELECT = {
  id: true,
  inventory_item_id: true,
  snapshot_quantity: true,
  counted_quantity: true,
  delta: true,
  adjustment_movement_id: true,
  inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
  adjustment_movement: { select: ADJUSTMENT_MOVEMENT_SELECT },
} as const;

const SESSION_ITEM_ORDER_BY: Prisma.InventoryReconciliationItemOrderByWithRelationInput[] = [
  { inventory_item_id: "asc" },
];

const SESSION_DETAIL_SELECT = {
  id: true,
  distributor_id: true,
  status: true,
  opened_by: true,
  closed_by: true,
  justification: true,
  opened_at: true,
  closed_at: true,
  created_at: true,
  updated_at: true,
  distributor: { select: DISTRIBUTOR_READ_SELECT },
  items: {
    select: SESSION_ITEM_SELECT,
    orderBy: SESSION_ITEM_ORDER_BY,
  },
} satisfies Prisma.InventoryReconciliationSessionSelect;

export type ReconciliationSessionItemRead = {
  id: string;
  inventory_item_id: string;
  snapshot_quantity: number;
  counted_quantity: number | null;
  delta: number | null;
  adjustment_movement_id: string | null;
  inventory_item: {
    id: string;
    code: string;
    name: string;
    type: InventoryItemType;
    unit_label: string;
    low_stock_threshold: number | null;
  };
  adjustment_movement: {
    id: string;
    quantity_delta: number;
    occurred_at: Date;
  } | null;
};

export type ReconciliationSessionRead = {
  id: string;
  distributor_id: string;
  status: InventoryReconciliationStatus;
  opened_by: string;
  closed_by: string | null;
  justification: string | null;
  opened_at: Date;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  distributor: { id: string; name: string };
  items: ReconciliationSessionItemRead[];
};

export type ReconciliationSessionListRow = Omit<ReconciliationSessionRead, "items"> & {
  _count: { items: number };
};

export type SnapshotBalanceRow = {
  inventory_item_id: string;
  quantity_on_hand: number;
};

export type ListReconciliationSessionsParams = {
  distributorId?: string;
  status?: InventoryReconciliationStatus;
  start?: Date;
  end?: Date;
  limit: number;
  offset: number;
};

type SessionLockRow = {
  id: string;
  distributor_id: string;
  status: InventoryReconciliationStatus;
};

function sessionWhere(params: ListReconciliationSessionsParams): Prisma.InventoryReconciliationSessionWhereInput {
  return {
    ...(params.distributorId ? { distributor_id: params.distributorId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.start || params.end
      ? {
          opened_at: {
            ...(params.start ? { gte: params.start } : {}),
            ...(params.end ? { lte: params.end } : {}),
          },
        }
      : {}),
  };
}

export const reconciliationSessionRepository = {
  async findOpenSession(distributorId: string, tx?: TxClient): Promise<{ id: string } | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryReconciliationSession.findFirst({
      where: {
        distributor_id: distributorId,
        status: InventoryReconciliationStatusValue.OPEN,
      },
      select: { id: true },
    });
  },

  async listSnapshotBalances(distributorId: string, tx: TxClient): Promise<SnapshotBalanceRow[]> {
    const items = await tx.inventoryItem.findMany({
      where: { is_active: true },
      select: {
        id: true,
        distributor_balances: {
          where: { distributor_id: distributorId },
          select: { quantity_on_hand: true },
          take: 1,
        },
      },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });

    return items.map((item) => ({
      inventory_item_id: item.id,
      quantity_on_hand: item.distributor_balances[0]?.quantity_on_hand ?? 0,
    }));
  },

  async createOpenSession(
    data: {
      distributorId: string;
      openedBy: string;
      snapshotBalances: SnapshotBalanceRow[];
    },
    tx: TxClient
  ): Promise<ReconciliationSessionRead> {
    return tx.inventoryReconciliationSession.create({
      data: {
        distributor_id: data.distributorId,
        opened_by: data.openedBy,
        ...(data.snapshotBalances.length > 0
          ? {
              items: {
                create: data.snapshotBalances.map((balance) => ({
                  inventory_item_id: balance.inventory_item_id,
                  snapshot_quantity: balance.quantity_on_hand,
                })),
              },
            }
          : {}),
      },
      select: SESSION_DETAIL_SELECT,
    });
  },

  async findSessionForDistributor(
    sessionId: string,
    distributorId: string,
    tx?: TxClient
  ): Promise<ReconciliationSessionRead | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryReconciliationSession.findFirst({
      where: { id: sessionId, distributor_id: distributorId },
      select: SESSION_DETAIL_SELECT,
    });
  },

  async findSessionById(sessionId: string, tx?: TxClient): Promise<ReconciliationSessionRead | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryReconciliationSession.findUnique({
      where: { id: sessionId },
      select: SESSION_DETAIL_SELECT,
    });
  },

  async findSessionForUpdate(
    sessionId: string,
    distributorId: string,
    tx: TxClient
  ): Promise<SessionLockRow | null> {
    const rows = await tx.$queryRaw<SessionLockRow[]>`
      SELECT id, distributor_id, status
      FROM "32_trn_inventory_reconciliation_sessions"
      WHERE id = ${sessionId}::uuid
        AND distributor_id = ${distributorId}::uuid
      FOR UPDATE
      LIMIT 1
    `;

    return rows[0] ?? null;
  },

  async updateItemClose(
    data: {
      itemId: string;
      countedQuantity: number;
      delta: number;
      adjustmentMovementId: string | null;
    },
    tx: TxClient
  ) {
    return tx.inventoryReconciliationItem.update({
      where: { id: data.itemId },
      data: {
        counted_quantity: data.countedQuantity,
        delta: data.delta,
        adjustment_movement_id: data.adjustmentMovementId,
      },
    });
  },

  async closeSession(
    data: {
      sessionId: string;
      closedBy: string;
      justification: string | null;
      closedAt: Date;
    },
    tx: TxClient
  ): Promise<ReconciliationSessionRead> {
    return tx.inventoryReconciliationSession.update({
      where: { id: data.sessionId },
      data: {
        status: InventoryReconciliationStatusValue.CLOSED,
        closed_by: data.closedBy,
        justification: data.justification,
        closed_at: data.closedAt,
      },
      select: SESSION_DETAIL_SELECT,
    });
  },

  async listSessions(
    params: ListReconciliationSessionsParams
  ): Promise<{ sessions: ReconciliationSessionListRow[]; total: number }> {
    const prisma = getPrisma();
    const where = sessionWhere(params);

    const [sessions, total] = await Promise.all([
      prisma.inventoryReconciliationSession.findMany({
        where,
        select: {
          id: true,
          distributor_id: true,
          status: true,
          opened_by: true,
          closed_by: true,
          justification: true,
          opened_at: true,
          closed_at: true,
          created_at: true,
          updated_at: true,
          distributor: { select: DISTRIBUTOR_READ_SELECT },
          _count: { select: { items: true } },
        },
        orderBy: [{ opened_at: "desc" }, { id: "desc" }],
        skip: params.offset,
        take: params.limit,
      }),
      prisma.inventoryReconciliationSession.count({ where }),
    ]);

    return { sessions, total };
  },
};