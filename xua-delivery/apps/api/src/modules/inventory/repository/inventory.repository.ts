import { Prisma } from "@prisma/client";
import type {
  DistributorInventoryBalance,
  InventoryMovement,
} from "@prisma/client";
import type {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
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

function toJsonValue(value?: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value ?? ({} as Prisma.InputJsonValue);
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
        quantity_on_hand: quantityDelta,
        last_movement_at: occurredAt,
      },
    });
  },
};
