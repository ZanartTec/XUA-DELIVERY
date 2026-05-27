import { getPrisma } from "../../../infra/prisma/client.js";
import { distributorRepository } from "../repository/distributor.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import { createHash } from "crypto";
import type {
  InventoryBalanceQueryInput,
  InventoryItemFilterInput,
  InventoryInitialLoadInput,
  InventoryReconciliationSessionQueryInput,
  InventoryReconciliationSessionCloseInput,
  InventoryMovementQueryInput,
} from "@xua/shared/schemas/inventory";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import { inventoryService } from "../../inventory/services/inventory.service.js";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import { inventoryReconciliationSessionService } from "../../inventory/services/reconciliation-session.service.js";

const log = createLogger("distributor-service");

type CreateInitialInventoryLoadInput = {
  actorUserId: string;
  payload: InventoryInitialLoadInput;
};

type InitialInventoryLoadItemResult = {
  inventory_item_id: string;
  quantity: number;
  movement_id: string | null;
  balance_id: string | null;
  quantity_on_hand: number | null;
  idempotent_replay: boolean;
  skipped: boolean;
};

type InitialInventoryLoadResult = {
  distributor_id: string;
  batch_id: string;
  applied_count: number;
  replayed_count: number;
  skipped_count: number;
  items: InitialInventoryLoadItemResult[];
};

type ListInventoryBalancesInput = {
  actorUserId: string;
  query: InventoryBalanceQueryInput;
};

type ListInventoryMovementsInput = {
  actorUserId: string;
  query: InventoryMovementQueryInput;
};

type ListInventoryItemsInput = {
  actorUserId: string;
  query: InventoryItemFilterInput;
};

type ListInventoryReconciliationSessionsInput = {
  actorUserId: string;
  query: InventoryReconciliationSessionQueryInput;
};

type CloseInventoryReconciliationSessionInput = {
  actorUserId: string;
  sessionId: string;
  payload: InventoryReconciliationSessionCloseInput;
};

function buildInitialLoadMetadata(
  batchId: string,
  payload: InventoryInitialLoadInput,
  batchHash: string
): Record<string, string | number> {
  return {
    origin: "distributor_initial_load_endpoint",
    batch_id: batchId,
    batch_hash: batchHash,
    batch_version: payload.batch_version ?? "v1",
    ...(payload.observation ? { observation: payload.observation } : {}),
  };
}

function buildInitialLoadBatchHash(payload: InventoryInitialLoadInput): string {
  const manifest = payload.items
    .map((item) => ({ inventory_item_id: item.inventory_item_id, quantity: item.quantity }))
    .sort((left, right) => left.inventory_item_id.localeCompare(right.inventory_item_id));

  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function movementBatchHash(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>).batch_hash;
  return typeof value === "string" ? value : null;
}

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

export const distributorService = {
  /**
   * Resolve a distribuidora final para um pedido.
   * - Se distributorId fornecido: valida contra a zona/capacidade → modo manual.
   * - Senão: usa zone.distributor_id (lógica automática atual).
   */
  async resolveDistributor(
    consumerId: string,
    zoneId: string,
    deliveryDate: string,
    window: string,
    distributorId?: string,
  ): Promise<{ distributorId: string; zoneId: string; mode: "manual" | "auto" }> {
    const prisma = getPrisma();

    if (distributorId) {
      // Validação: distributor deve atender a mesma área geográfica da zona
      const result = await distributorRepository.validateDistributorForZone(
        distributorId,
        zoneId,
        deliveryDate,
        window,
      );

      if (!result.valid || !result.resolvedZoneId) {
        throw new DistributorServiceError(
          "DISTRIBUTOR_NOT_AVAILABLE",
          "Distribuidora selecionada não atende esta zona/data/janela",
        );
      }

      log.info(
        { consumerId, distributorId, zoneId, mode: "manual" },
        "Distributor resolved manually",
      );

      return {
        distributorId,
        zoneId: result.resolvedZoneId,
        mode: "manual",
      };
    }

    // Fallback automático: usa distributor_id da zona do endereço
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { distributor_id: true },
    });

    if (!zone) {
      throw new DistributorServiceError("ZONE_NOT_FOUND", "Zona não encontrada");
    }

    log.info(
      { consumerId, distributorId: zone.distributor_id, zoneId, mode: "auto" },
      "Distributor resolved automatically",
    );

    return {
      distributorId: zone.distributor_id,
      zoneId,
      mode: "auto",
    };
  },

  async createInitialInventoryLoad({
    actorUserId,
    payload,
  }: CreateInitialInventoryLoadInput): Promise<InitialInventoryLoadResult> {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    const batchId = payload.batch_id;
    const batchHash = buildInitialLoadBatchHash(payload);
    const metadata = buildInitialLoadMetadata(batchId, payload, batchHash);
    const prisma = getPrisma();

    const items = await prisma.$transaction(async (tx) => {
      const results: InitialInventoryLoadItemResult[] = [];
      const existingBatchMovements = await inventoryRepository.findInitialLoadMovementsByBatch(
        distributorId,
        batchId,
        tx
      );

      if (existingBatchMovements.length > 0) {
        const existingBatchHash = movementBatchHash(existingBatchMovements[0]!.metadata);
        if (existingBatchHash !== batchHash) {
          throw new DistributorServiceError(
            "INITIAL_LOAD_BATCH_CONFLICT",
            "Lote de carga inicial já existe com payload diferente"
          );
        }
      }

      for (const item of payload.items) {
        if (item.quantity === 0) {
          results.push({
            inventory_item_id: item.inventory_item_id,
            quantity: item.quantity,
            movement_id: null,
            balance_id: null,
            quantity_on_hand: null,
            idempotent_replay: false,
            skipped: true,
          });
          continue;
        }

        const existingInitialLoad = await inventoryRepository.findInitialLoadMovementForItem(
          distributorId,
          item.inventory_item_id,
          tx
        );

        if (existingInitialLoad && existingInitialLoad.reference_id !== batchId) {
          throw new DistributorServiceError(
            "INITIAL_LOAD_ALREADY_EXISTS",
            "Item já possui carga inicial registrada; use ajuste ou conciliação para correções"
          );
        }

        const result = await inventoryService.applyMovement(
          {
            distributorId,
            inventoryItemId: item.inventory_item_id,
            quantityDelta: item.quantity,
            movementType: InventoryMovementType.INITIAL_LOAD,
            actor: { type: ActorType.DISTRIBUTOR_USER, id: actorUserId },
            sourceApp: SourceApp.DISTRIBUTOR_WEB,
            reference: { type: InventoryReferenceType.INITIAL_LOAD, id: batchId },
            metadata,
          },
          tx
        );

        results.push({
          inventory_item_id: item.inventory_item_id,
          quantity: item.quantity,
          movement_id: result.movement.id,
          balance_id: result.balance.id,
          quantity_on_hand: result.balance.quantity_on_hand,
          idempotent_replay: result.idempotentReplay,
          skipped: false,
        });
      }

      return results;
    });

    log.info(
      {
        distributorId,
        actorUserId,
        batchId,
        itemCount: payload.items.length,
        appliedCount: items.filter((item) => !item.skipped && !item.idempotent_replay).length,
        replayedCount: items.filter((item) => item.idempotent_replay).length,
        skippedCount: items.filter((item) => item.skipped).length,
      },
      "Initial inventory load applied"
    );

    return {
      distributor_id: distributorId,
      batch_id: batchId,
      applied_count: items.filter((item) => !item.skipped && !item.idempotent_replay).length,
      replayed_count: items.filter((item) => item.idempotent_replay).length,
      skipped_count: items.filter((item) => item.skipped).length,
      items,
    };
  },

  async listInventoryBalances({ actorUserId, query }: ListInventoryBalancesInput) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    const { balances, total } = await inventoryRepository.listBalances({
      distributorId,
      inventoryItemId: query.inventory_item_id,
      ...(query.q ? { search: query.q } : {}),
      ...(query.item_type ? { itemType: query.item_type } : {}),
      ...(query.stock_status ? { stockStatus: query.stock_status } : {}),
      limit: query.limit,
      offset: query.offset,
    });

    return {
      balances: balances.map((balance) => {
        const lowStockThreshold = balance.inventory_item.low_stock_threshold;

        return {
          id: balance.id,
          inventory_item_id: balance.inventory_item_id,
          item: {
            id: balance.inventory_item.id,
            code: balance.inventory_item.code,
            name: balance.inventory_item.name,
            type: balance.inventory_item.type,
            unit_label: balance.inventory_item.unit_label,
          },
          quantity_on_hand: balance.quantity_on_hand,
          low_stock_threshold: lowStockThreshold,
          is_low_stock:
            lowStockThreshold != null && balance.quantity_on_hand <= lowStockThreshold,
          last_movement_at: balance.last_movement_at,
          updated_at: balance.updated_at,
        };
      }),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async listInventoryMovements({ actorUserId, query }: ListInventoryMovementsInput) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    const { movements, total } = await inventoryRepository.listMovements({
      distributorId,
      inventoryItemId: query.inventory_item_id,
      movementType: query.movement_type,
      start: toPeriodDate(query.start, "start"),
      end: toPeriodDate(query.end, "end"),
      limit: query.limit,
      offset: query.offset,
    });

    return {
      movements: movements.map((movement) => ({
        id: movement.id,
        inventory_item_id: movement.inventory_item_id,
        item: {
          id: movement.inventory_item.id,
          code: movement.inventory_item.code,
          name: movement.inventory_item.name,
          type: movement.inventory_item.type,
          unit_label: movement.inventory_item.unit_label,
        },
        quantity_delta: movement.quantity_delta,
        movement_type: movement.movement_type,
        actor_type: movement.actor_type,
        actor_id: movement.actor_id,
        source_app: movement.source_app,
        reference_type: movement.reference_type,
        reference_id: movement.reference_id,
        metadata: movement.metadata,
        occurred_at: movement.occurred_at,
      })),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async listInventoryItems({ actorUserId, query }: ListInventoryItemsInput) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    const { items, total } = await inventoryRepository.listInventoryItems({
      search: query.q,
      code: query.code,
      name: query.name,
      type: query.type,
      productId: query.product_id,
      isActive: query.is_active ?? true,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items,
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async openInventoryReconciliationSession({ actorUserId }: { actorUserId: string }) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    return inventoryReconciliationSessionService.openSession({ distributorId, actorUserId });
  },

  async getInventoryReconciliationSession({
    actorUserId,
    sessionId,
  }: {
    actorUserId: string;
    sessionId: string;
  }) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    return inventoryReconciliationSessionService.getSessionForDistributor({
      distributorId,
      sessionId,
    });
  },

  async listInventoryReconciliationSessions({
    actorUserId,
    query,
  }: ListInventoryReconciliationSessionsInput) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    return inventoryReconciliationSessionService.listSessionsForDistributor({
      distributorId,
      query,
    });
  },

  async closeInventoryReconciliationSession({
    actorUserId,
    sessionId,
    payload,
  }: CloseInventoryReconciliationSessionInput) {
    const distributorId = await distributorRepository.resolveDistributorId(actorUserId);
    if (!distributorId) {
      throw new DistributorServiceError(
        "DISTRIBUTOR_NOT_LINKED",
        "Usuário não vinculado a nenhuma distribuidora"
      );
    }

    return inventoryReconciliationSessionService.closeSession({
      distributorId,
      sessionId,
      actorUserId,
      payload,
    });
  },
};

export class DistributorServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DistributorServiceError";
  }
}
