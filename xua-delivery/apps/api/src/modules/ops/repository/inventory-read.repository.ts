import type { Prisma } from "@prisma/client";
import type {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  InventoryItemType,
  SourceApp,
} from "@xua/shared/enums";
import type { InventoryStockStatusFilterInput } from "@xua/shared/schemas/inventory";
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

export type OpsInventoryDistributorRow = OpsDistributorRead;

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

export type OpsInventoryBalanceListParams = {
  distributorId?: string;
  search?: string;
  inventoryItemId?: string;
  itemType?: InventoryItemType;
  stockStatus?: InventoryStockStatusFilterInput;
  limit: number;
  offset: number;
};

export type OpsInventoryMovementListParams = OpsInventoryBalanceListParams & {
  movementType?: InventoryMovementType;
  start?: Date;
  end?: Date;
};

function balanceItemWhere(params: {
  search?: string;
  itemType?: InventoryItemType;
}): Prisma.InventoryItemWhereInput | undefined {
  const where: Prisma.InventoryItemWhereInput = {
    ...(params.search
      ? {
          OR: [
            { code: { contains: params.search, mode: "insensitive" } },
            { name: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.itemType ? { type: params.itemType } : {}),
  };

  return Object.keys(where).length > 0 ? where : undefined;
}

function matchesStockStatus(
  balance: OpsInventoryBalanceRow,
  stockStatus: InventoryStockStatusFilterInput
): boolean {
  const threshold = balance.inventory_item.low_stock_threshold;
  const isLowStock = threshold !== null && balance.quantity_on_hand <= threshold;
  return stockStatus === "LOW_STOCK" ? isLowStock : !isLowStock;
}

export const opsInventoryReadRepository = {
  async listDistributors(): Promise<OpsInventoryDistributorRow[]> {
    const prisma = getPrisma();
    return prisma.distributor.findMany({
      where: { is_active: true },
      select: DISTRIBUTOR_READ_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  },

  async listBalances(
    params: OpsInventoryBalanceListParams
  ): Promise<{ balances: OpsInventoryBalanceRow[]; total: number }> {
    const prisma = getPrisma();
    const inventoryItemWhere = balanceItemWhere({
      search: params.search,
      itemType: params.itemType,
    });
    const where: Prisma.DistributorInventoryBalanceWhereInput = {
      ...(params.distributorId ? { distributor_id: params.distributorId } : {}),
      ...(params.inventoryItemId ? { inventory_item_id: params.inventoryItemId } : {}),
      ...(inventoryItemWhere ? { inventory_item: inventoryItemWhere } : {}),
    };

    if (params.stockStatus) {
      const balances = await prisma.distributorInventoryBalance.findMany({
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
      });
      const filtered = balances.filter((balance) => matchesStockStatus(balance, params.stockStatus!));

      return {
        balances: filtered.slice(params.offset, params.offset + params.limit),
        total: filtered.length,
      };
    }

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
};