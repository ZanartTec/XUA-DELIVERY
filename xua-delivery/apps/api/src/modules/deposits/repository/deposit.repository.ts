import type { Prisma } from "@prisma/client";
import type { DepositMovementType } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";

export type TxClient = Prisma.TransactionClient;

/**
 * DepositRepository — persistência da caução de vasilhames:
 * programa (vínculo), saldo materializado e histórico (event-sourcing).
 */
export const depositRepository = {
  // ─── Programa (vínculo Distribuidora×Consumidor) ──────────
  async findProgram(distributorId: string, consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositProgram.findUnique({
      where: {
        distributor_id_consumer_id: {
          distributor_id: distributorId,
          consumer_id: consumerId,
        },
      },
    });
  },

  async listProgramsByDistributor(distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositProgram.findMany({
      where: { distributor_id: distributorId },
      orderBy: { updated_at: "desc" },
      include: {
        consumer: { select: { id: true, name: true, document: true, email: true } },
      },
    });
  },

  async upsertProgram(
    data: {
      distributorId: string;
      consumerId: string;
      documentSnapshot: string;
      maxBottles: number;
      notes?: string | null;
      enabledBy: string;
    },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositProgram.upsert({
      where: {
        distributor_id_consumer_id: {
          distributor_id: data.distributorId,
          consumer_id: data.consumerId,
        },
      },
      create: {
        distributor_id: data.distributorId,
        consumer_id: data.consumerId,
        consumer_document_snapshot: data.documentSnapshot,
        max_bottles: data.maxBottles,
        notes: data.notes ?? null,
        is_enabled: true,
        enabled_by: data.enabledBy,
        enabled_at: new Date(),
      },
      update: {
        consumer_document_snapshot: data.documentSnapshot,
        max_bottles: data.maxBottles,
        notes: data.notes ?? null,
        is_enabled: true,
        enabled_by: data.enabledBy,
        enabled_at: new Date(),
        disabled_by: null,
        disabled_at: null,
      },
    });
  },

  async patchProgram(
    distributorId: string,
    consumerId: string,
    data: {
      isEnabled?: boolean;
      maxBottles?: number;
      notes?: string | null;
      disabledBy?: string;
    },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    const update: Prisma.ConsumerDepositProgramUpdateInput = {};
    if (data.maxBottles != null) update.max_bottles = data.maxBottles;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.isEnabled != null) {
      update.is_enabled = data.isEnabled;
      if (!data.isEnabled) {
        update.disabled_by = data.disabledBy ?? null;
        update.disabled_at = new Date();
      } else {
        update.disabled_by = null;
        update.disabled_at = null;
      }
    }
    return (tx ?? prisma).consumerDepositProgram.update({
      where: {
        distributor_id_consumer_id: {
          distributor_id: distributorId,
          consumer_id: consumerId,
        },
      },
      data: update,
    });
  },

  // ─── Saldo materializado ──────────────────────────────────
  async findBalance(
    distributorId: string,
    consumerId: string,
    inventoryItemId: string,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositBalance.findUnique({
      where: {
        distributor_id_consumer_id_inventory_item_id: {
          distributor_id: distributorId,
          consumer_id: consumerId,
          inventory_item_id: inventoryItemId,
        },
      },
    });
  },

  /** Soma do saldo devedor do consumidor na distribuidora (todos os vasilhames). */
  async sumBalancesForConsumer(distributorId: string, consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    const agg = await (tx ?? prisma).consumerDepositBalance.aggregate({
      where: { distributor_id: distributorId, consumer_id: consumerId },
      _sum: { bottles_on_loan: true },
    });
    return agg._sum.bottles_on_loan ?? 0;
  },

  async listBalancesByConsumer(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositBalance.findMany({
      where: { consumer_id: consumerId, bottles_on_loan: { gt: 0 } },
      include: {
        distributor: { select: { id: true, name: true } },
        inventory_item: { select: { id: true, code: true, name: true } },
      },
    });
  },

  async listBalancesByDistributor(distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositBalance.findMany({
      where: { distributor_id: distributorId, bottles_on_loan: { gt: 0 } },
      include: {
        consumer: { select: { id: true, name: true, document: true } },
        inventory_item: { select: { id: true, code: true, name: true } },
      },
      orderBy: { bottles_on_loan: "desc" },
    });
  },

  /** Aplica delta ao saldo (cria se não existir). Caller garante saldo >= 0. */
  async applyBalanceDelta(
    distributorId: string,
    consumerId: string,
    inventoryItemId: string,
    delta: number,
    occurredAt: Date,
    tx: TxClient
  ) {
    return tx.consumerDepositBalance.upsert({
      where: {
        distributor_id_consumer_id_inventory_item_id: {
          distributor_id: distributorId,
          consumer_id: consumerId,
          inventory_item_id: inventoryItemId,
        },
      },
      create: {
        distributor_id: distributorId,
        consumer_id: consumerId,
        inventory_item_id: inventoryItemId,
        bottles_on_loan: delta,
        last_movement_at: occurredAt,
      },
      update: {
        bottles_on_loan: { increment: delta },
        last_movement_at: occurredAt,
      },
    });
  },

  // ─── Histórico (event-sourcing) ───────────────────────────
  async createMovement(
    data: {
      distributorId: string;
      consumerId: string;
      inventoryItemId: string;
      bottlesDelta: number;
      movementType: DepositMovementType;
      actorType: string;
      actorId: string;
      sourceApp: string;
      orderId?: string | null;
      notes?: string | null;
      occurredAt?: Date;
    },
    tx: TxClient
  ) {
    return tx.consumerDepositMovement.create({
      data: {
        distributor_id: data.distributorId,
        consumer_id: data.consumerId,
        inventory_item_id: data.inventoryItemId,
        bottles_delta: data.bottlesDelta,
        movement_type: data.movementType,
        actor_type: data.actorType as never,
        actor_id: data.actorId,
        source_app: data.sourceApp as never,
        order_id: data.orderId ?? null,
        notes: data.notes ?? null,
        occurred_at: data.occurredAt ?? new Date(),
      },
    });
  },

  /** Movimentos já aplicados a um pedido (idempotência do settlement na entrega). */
  async findMovementsByOrder(orderId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositMovement.findMany({
      where: { order_id: orderId },
    });
  },

  async listMovementsByConsumer(
    distributorId: string,
    consumerId: string,
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumerDepositMovement.findMany({
      where: { distributor_id: distributorId, consumer_id: consumerId },
      orderBy: { occurred_at: "desc" },
      take: 100,
    });
  },

  // ─── Lookup de consumidor por documento ───────────────────
  async findConsumerByDocument(document: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).consumer.findUnique({
      where: { document },
      select: { id: true, name: true, document: true, email: true },
    });
  },
};
