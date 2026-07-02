import { Prisma } from "@prisma/client";
import type {
  DistributorInventoryBalance,
  InventoryItem,
  InventoryMovement,
} from "@prisma/client";
import type {
  ActorType,
  InventoryItemType as InventoryItemTypeInput,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import type { InventoryStockStatusFilterInput } from "@xua/shared/schemas/inventory";
import {
  InventoryItemType as InventoryItemTypeValue,
  InventoryMovementType as InventoryMovementTypeValue,
  InventoryReferenceType as InventoryReferenceTypeValue,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";

export type TxClient = Prisma.TransactionClient;

const DISTRIBUTOR_SELECT = {
  id: true,
  is_active: true,
} as const;

const INVENTORY_ITEM_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  product_id: true,
  is_active: true,
} as const;

const INVENTORY_ITEM_READ_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  unit_label: true,
  low_stock_threshold: true,
} as const;

const INVENTORY_ITEM_CATALOG_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  product_id: true,
  unit_label: true,
  low_stock_threshold: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

type MovementReferenceLookup = {
  distributorId: string;
  inventoryItemId: string;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  referenceId: string;
};

type CreateMovementData = {
  distributor_id: string;
  inventory_item_id: string;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  actor_type: ActorType;
  actor_id: string;
  source_app: SourceApp;
  reference_type?: InventoryReferenceType | null;
  reference_id?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurred_at: Date;
};

type InventoryItemRead = Pick<
  InventoryItem,
  "id" | "code" | "name" | "type" | "unit_label" | "low_stock_threshold"
>;

export type InventoryItemCatalogRow = Pick<
  InventoryItem,
  | "id"
  | "code"
  | "name"
  | "type"
  | "product_id"
  | "unit_label"
  | "low_stock_threshold"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

export type InventoryBalanceWithItem = Pick<
  DistributorInventoryBalance,
  "id" | "inventory_item_id" | "quantity_on_hand" | "last_movement_at" | "updated_at"
> & {
  inventory_item: InventoryItemRead;
};

export type InventoryMovementWithItem = Pick<
  InventoryMovement,
  | "id"
  | "inventory_item_id"
  | "quantity_delta"
  | "movement_type"
  | "actor_type"
  | "actor_id"
  | "source_app"
  | "reference_type"
  | "reference_id"
  | "metadata"
  | "occurred_at"
> & {
  inventory_item: InventoryItemRead;
};

export type InventoryBalanceListParams = {
  distributorId: string;
  search?: string;
  inventoryItemId?: string;
  itemType?: InventoryItemTypeInput;
  stockStatus?: InventoryStockStatusFilterInput;
  limit: number;
  offset: number;
};

export type InventoryMovementListParams = InventoryBalanceListParams & {
  movementType?: InventoryMovementType;
  start?: Date;
  end?: Date;
};

export type InventoryItemListParams = {
  search?: string;
  code?: string;
  name?: string;
  type?: InventoryItemTypeInput;
  productId?: string;
  isActive?: boolean;
  limit: number;
  offset: number;
};

function toJsonValue(value?: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value ?? ({} as Prisma.InputJsonValue);
}

function inventoryItemWhere(params: InventoryItemListParams): Prisma.InventoryItemWhereInput {
  return {
    ...(params.search
      ? {
          OR: [
            { code: { contains: params.search, mode: "insensitive" } },
            { name: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.code ? { code: params.code } : {}),
    ...(params.name ? { name: { contains: params.name, mode: "insensitive" } } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.productId ? { product_id: params.productId } : {}),
    ...(params.isActive === undefined ? {} : { is_active: params.isActive }),
  };
}

function balanceItemWhere(params: {
  search?: string;
  itemType?: InventoryItemTypeInput;
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
  balance: InventoryBalanceWithItem,
  stockStatus: InventoryStockStatusFilterInput
): boolean {
  const threshold = balance.inventory_item.low_stock_threshold;
  const isLowStock = threshold !== null && balance.quantity_on_hand <= threshold;
  return stockStatus === "LOW_STOCK" ? isLowStock : !isLowStock;
}

export const inventoryRepository = {
  async findDistributor(distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).distributor.findUnique({
      where: { id: distributorId },
      select: DISTRIBUTOR_SELECT,
    });
  },

  async findInventoryItem(inventoryItemId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: INVENTORY_ITEM_SELECT,
    });
  },

  /**
   * Itens de estoque ativos movimentáveis por venda, vinculados aos produtos.
   * Aceita qualquer tipo vendável/retornável (SELLABLE_PRODUCT, RETURNABLE_FULL,
   * RETURNABLE_EMPTY); SUPPLY fica de fora por ser suprimento interno.
   */
  async findActiveInventoryItemsByProductIds(productIds: string[], tx?: TxClient) {
    if (productIds.length === 0) return [];

    const prisma = getPrisma();
    return (tx ?? prisma).inventoryItem.findMany({
      where: {
        product_id: { in: productIds },
        type: {
          in: [
            InventoryItemTypeValue.SELLABLE_PRODUCT,
            InventoryItemTypeValue.RETURNABLE_FULL,
            InventoryItemTypeValue.RETURNABLE_EMPTY,
          ],
        },
        is_active: true,
      },
      select: INVENTORY_ITEM_SELECT,
      orderBy: [{ product_id: "asc" }, { code: "asc" }],
    });
  },

  async findActiveReturnableEmptyItem(tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryItem.findFirst({
      where: {
        type: InventoryItemTypeValue.RETURNABLE_EMPTY,
        is_active: true,
      },
      select: INVENTORY_ITEM_SELECT,
      orderBy: { code: "asc" },
    });
  },

  /**
   * Vasilhame cheio retornável — item canônico usado como "vasilhame" no settlement
   * de caução (empréstimo/venda). Mantém o mesmo padrão de findActiveReturnableEmptyItem.
   */
  async findActiveReturnableFullItem(tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryItem.findFirst({
      where: {
        type: InventoryItemTypeValue.RETURNABLE_FULL,
        is_active: true,
      },
      select: INVENTORY_ITEM_SELECT,
      orderBy: { code: "asc" },
    });
  },

  async listInventoryItems(
    params: InventoryItemListParams,
    tx?: TxClient
  ): Promise<{ items: InventoryItemCatalogRow[]; total: number }> {
    const prisma = getPrisma();
    const client = tx ?? prisma;
    const where = inventoryItemWhere(params);

    const [items, total] = await Promise.all([
      client.inventoryItem.findMany({
        where,
        select: INVENTORY_ITEM_CATALOG_SELECT,
        orderBy: [{ code: "asc" }, { id: "asc" }],
        skip: params.offset,
        take: params.limit,
      }),
      client.inventoryItem.count({ where }),
    ]);

    return { items, total };
  },

  async findBalance(
    distributorId: string,
    inventoryItemId: string,
    tx?: TxClient
  ): Promise<DistributorInventoryBalance | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).distributorInventoryBalance.findUnique({
      where: {
        distributor_id_inventory_item_id: {
          distributor_id: distributorId,
          inventory_item_id: inventoryItemId,
        },
      },
    });
  },

  async findBalanceForUpdate(
    distributorId: string,
    inventoryItemId: string,
    tx: TxClient
  ): Promise<DistributorInventoryBalance | null> {
    const rows = await tx.$queryRaw<DistributorInventoryBalance[]>`
      SELECT *
      FROM "30_trn_distributor_inventory_balances"
      WHERE distributor_id = ${distributorId}::uuid
        AND inventory_item_id = ${inventoryItemId}::uuid
      FOR UPDATE
      LIMIT 1
    `;

    return rows[0] ?? null;
  },

  async findMovementByReference(
    lookup: MovementReferenceLookup,
    tx?: TxClient
  ): Promise<InventoryMovement | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryMovement.findFirst({
      where: {
        distributor_id: lookup.distributorId,
        inventory_item_id: lookup.inventoryItemId,
        movement_type: lookup.movementType,
        reference_type: lookup.referenceType,
        reference_id: lookup.referenceId,
      },
    });
  },

  async listBalances(
    params: InventoryBalanceListParams,
    tx?: TxClient
  ): Promise<{ balances: InventoryBalanceWithItem[]; total: number }> {
    const prisma = getPrisma();
    const client = tx ?? prisma;
    const inventoryItemWhere = balanceItemWhere({
      search: params.search,
      itemType: params.itemType,
    });
    const where: Prisma.DistributorInventoryBalanceWhereInput = {
      distributor_id: params.distributorId,
      ...(params.inventoryItemId ? { inventory_item_id: params.inventoryItemId } : {}),
      ...(inventoryItemWhere ? { inventory_item: inventoryItemWhere } : {}),
    };

    if (params.stockStatus) {
      const balances = await client.distributorInventoryBalance.findMany({
        where,
        select: {
          id: true,
          inventory_item_id: true,
          quantity_on_hand: true,
          last_movement_at: true,
          updated_at: true,
          inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
        },
        orderBy: [{ inventory_item_id: "asc" }],
      });
      const filtered = balances.filter((balance) => matchesStockStatus(balance, params.stockStatus!));

      return {
        balances: filtered.slice(params.offset, params.offset + params.limit),
        total: filtered.length,
      };
    }

    const [balances, total] = await Promise.all([
      client.distributorInventoryBalance.findMany({
        where,
        select: {
          id: true,
          inventory_item_id: true,
          quantity_on_hand: true,
          last_movement_at: true,
          updated_at: true,
          inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
        },
        orderBy: [{ inventory_item_id: "asc" }],
        skip: params.offset,
        take: params.limit,
      }),
      client.distributorInventoryBalance.count({ where }),
    ]);

    return { balances, total };
  },

  async listMovements(
    params: InventoryMovementListParams,
    tx?: TxClient
  ): Promise<{ movements: InventoryMovementWithItem[]; total: number }> {
    const prisma = getPrisma();
    const client = tx ?? prisma;
    const where: Prisma.InventoryMovementWhereInput = {
      distributor_id: params.distributorId,
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
      client.inventoryMovement.findMany({
        where,
        select: {
          id: true,
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
          inventory_item: { select: INVENTORY_ITEM_READ_SELECT },
        },
        orderBy: [{ occurred_at: "desc" }, { id: "desc" }],
        skip: params.offset,
        take: params.limit,
      }),
      client.inventoryMovement.count({ where }),
    ]);

    return { movements, total };
  },

  async findInitialLoadMovementsByBatch(
    distributorId: string,
    batchId: string,
    tx?: TxClient
  ): Promise<InventoryMovement[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryMovement.findMany({
      where: {
        distributor_id: distributorId,
        movement_type: InventoryMovementTypeValue.INITIAL_LOAD,
        reference_type: InventoryReferenceTypeValue.INITIAL_LOAD,
        reference_id: batchId,
      },
      orderBy: { occurred_at: "asc" },
    });
  },

  async findInitialLoadMovementForItem(
    distributorId: string,
    inventoryItemId: string,
    tx?: TxClient
  ): Promise<InventoryMovement | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).inventoryMovement.findFirst({
      where: {
        distributor_id: distributorId,
        inventory_item_id: inventoryItemId,
        movement_type: InventoryMovementTypeValue.INITIAL_LOAD,
        reference_type: InventoryReferenceTypeValue.INITIAL_LOAD,
      },
      orderBy: { occurred_at: "asc" },
    });
  },

  async createMovement(data: CreateMovementData, tx: TxClient): Promise<InventoryMovement> {
    return tx.inventoryMovement.create({
      data: {
        distributor_id: data.distributor_id,
        inventory_item_id: data.inventory_item_id,
        quantity_delta: data.quantity_delta,
        movement_type: data.movement_type,
        actor_type: data.actor_type,
        actor_id: data.actor_id,
        source_app: data.source_app,
        reference_type: data.reference_type ?? null,
        reference_id: data.reference_id ?? null,
        metadata: toJsonValue(data.metadata),
        occurred_at: data.occurred_at,
      },
    });
  },

  async createMovementOnce(
    data: CreateMovementData & {
      reference_type: InventoryReferenceType;
      reference_id: string;
    },
    tx: TxClient
  ): Promise<InventoryMovement | null> {
    try {
      return await tx.inventoryMovement.create({
        data: {
          distributor_id: data.distributor_id,
          inventory_item_id: data.inventory_item_id,
          quantity_delta: data.quantity_delta,
          movement_type: data.movement_type,
          actor_type: data.actor_type,
          actor_id: data.actor_id,
          source_app: data.source_app,
          reference_type: data.reference_type,
          reference_id: data.reference_id,
          metadata: toJsonValue(data.metadata),
          occurred_at: data.occurred_at,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }

      throw error;
    }
  },

  async upsertBalance(
    distributorId: string,
    inventoryItemId: string,
    quantityDelta: number,
    occurredAt: Date,
    tx: TxClient
  ): Promise<DistributorInventoryBalance> {
    return tx.distributorInventoryBalance.upsert({
      where: {
        distributor_id_inventory_item_id: {
          distributor_id: distributorId,
          inventory_item_id: inventoryItemId,
        },
      },
      update: {
        quantity_on_hand: { increment: quantityDelta },
        last_movement_at: occurredAt,
      },
      create: {
        distributor_id: distributorId,
        inventory_item_id: inventoryItemId,
        quantity_on_hand: quantityDelta < 0 ? 0 : quantityDelta,
        last_movement_at: occurredAt,
      },
    });
  },
};
