import { Prisma } from "@prisma/client";
import type {
  InventoryReconciliationSessionQueryInput,
  InventoryReconciliationSessionCloseInput,
  OpsInventoryReconciliationSessionQueryInput,
} from "@xua/shared/schemas/inventory";
import {
  ActorType,
  InventoryMovementType,
  InventoryReconciliationStatus,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { inventoryRepository } from "../repository/inventory.repository.js";
import { inventoryService } from "./inventory.service.js";
import { reconciliationSessionRepository } from "../repository/reconciliation-session.repository.js";
import type {
  ReconciliationSessionItemRead,
  ReconciliationSessionListRow,
  ReconciliationSessionRead,
} from "../repository/reconciliation-session.repository.js";

export class InventoryReconciliationSessionError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "InventoryReconciliationSessionError";
  }
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

function itemResponse(item: ReconciliationSessionItemRead) {
  return {
    id: item.id,
    inventory_item_id: item.inventory_item_id,
    item: {
      id: item.inventory_item.id,
      code: item.inventory_item.code,
      name: item.inventory_item.name,
      type: item.inventory_item.type,
      unit_label: item.inventory_item.unit_label,
    },
    snapshot_quantity: item.snapshot_quantity,
    counted_quantity: item.counted_quantity,
    delta: item.delta,
    adjustment_movement_id: item.adjustment_movement_id,
    adjustment_movement: item.adjustment_movement
      ? {
          id: item.adjustment_movement.id,
          quantity_delta: item.adjustment_movement.quantity_delta,
          occurred_at: item.adjustment_movement.occurred_at,
        }
      : null,
  };
}

function sessionDetailResponse(session: ReconciliationSessionRead) {
  return {
    id: session.id,
    distributor_id: session.distributor_id,
    distributor_name: session.distributor.name,
    status: session.status,
    opened_by: session.opened_by,
    closed_by: session.closed_by,
    justification: session.justification,
    opened_at: session.opened_at,
    closed_at: session.closed_at,
    created_at: session.created_at,
    updated_at: session.updated_at,
    items: session.items.map(itemResponse),
  };
}

function sessionListResponse(session: ReconciliationSessionListRow) {
  return {
    id: session.id,
    distributor_id: session.distributor_id,
    distributor_name: session.distributor.name,
    status: session.status,
    opened_by: session.opened_by,
    closed_by: session.closed_by,
    justification: session.justification,
    opened_at: session.opened_at,
    closed_at: session.closed_at,
    created_at: session.created_at,
    updated_at: session.updated_at,
    item_count: session._count.items,
  };
}

function assertCloseCountsMatchSession(
  session: ReconciliationSessionRead,
  payload: InventoryReconciliationSessionCloseInput
): Map<string, number> {
  const countByItemId = new Map(
    payload.counts.map((item) => [item.inventory_item_id, item.counted_quantity])
  );

  if (countByItemId.size !== session.items.length) {
    throw new InventoryReconciliationSessionError(
      "COUNT_ITEMS_MISMATCH",
      "Contagens devem cobrir exatamente os itens capturados no snapshot"
    );
  }

  for (const item of session.items) {
    if (!countByItemId.has(item.inventory_item_id)) {
      throw new InventoryReconciliationSessionError(
        "COUNT_ITEMS_MISMATCH",
        "Contagens devem cobrir exatamente os itens capturados no snapshot"
      );
    }
  }

  return countByItemId;
}

function requireJustificationIfNeeded(
  deltas: Array<{ delta: number }>,
  justification: string | undefined
): string | null {
  const hasDivergence = deltas.some((item) => item.delta !== 0);
  const normalized = justification?.trim() || null;

  if (hasDivergence && !normalized) {
    throw new InventoryReconciliationSessionError(
      "JUSTIFICATION_REQUIRED",
      "Justificativa obrigatória para divergências de estoque"
    );
  }

  return normalized;
}

function reconciliationMetadata(input: {
  sessionId: string;
  snapshotQuantity: number;
  currentQuantity: number;
  countedQuantity: number;
  delta: number;
}) {
  return {
    origin: "inventory_reconciliation_session_close",
    session_id: input.sessionId,
    snapshot_quantity: input.snapshotQuantity,
    current_quantity: input.currentQuantity,
    counted_quantity: input.countedQuantity,
    delta: input.delta,
  };
}

export const inventoryReconciliationSessionService = {
  async openSession(input: { distributorId: string; actorUserId: string }) {
    const prisma = getPrisma();

    try {
      const session = await prisma.$transaction(async (tx) => {
        const distributor = await inventoryRepository.findDistributor(input.distributorId, tx);
        if (!distributor) {
          throw new InventoryReconciliationSessionError(
            "DISTRIBUTOR_NOT_FOUND",
            "Distribuidora não encontrada"
          );
        }

        if (!distributor.is_active) {
          throw new InventoryReconciliationSessionError(
            "DISTRIBUTOR_INACTIVE",
            "Distribuidora inativa"
          );
        }

        const existingOpen = await reconciliationSessionRepository.findOpenSession(
          input.distributorId,
          tx
        );
        if (existingOpen) {
          throw new InventoryReconciliationSessionError(
            "OPEN_SESSION_EXISTS",
            "Já existe uma sessão de conciliação aberta para esta distribuidora"
          );
        }

        const snapshotBalances = await reconciliationSessionRepository.listSnapshotBalances(
          input.distributorId,
          tx
        );

        return reconciliationSessionRepository.createOpenSession(
          {
            distributorId: input.distributorId,
            openedBy: input.actorUserId,
            snapshotBalances,
          },
          tx
        );
      });

      return { session: sessionDetailResponse(session) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new InventoryReconciliationSessionError(
          "OPEN_SESSION_EXISTS",
          "Já existe uma sessão de conciliação aberta para esta distribuidora"
        );
      }

      throw error;
    }
  },

  async getSessionForDistributor(input: { distributorId: string; sessionId: string }) {
    const session = await reconciliationSessionRepository.findSessionForDistributor(
      input.sessionId,
      input.distributorId
    );

    return session ? { session: sessionDetailResponse(session) } : null;
  },

  async listSessionsForDistributor(input: {
    distributorId: string;
    query: InventoryReconciliationSessionQueryInput;
  }) {
    const { sessions, total } = await reconciliationSessionRepository.listSessions({
      distributorId: input.distributorId,
      status: input.query.status,
      start: toPeriodDate(input.query.start, "start"),
      end: toPeriodDate(input.query.end, "end"),
      limit: input.query.limit,
      offset: input.query.offset,
    });

    return {
      sessions: sessions.map(sessionListResponse),
      pagination: pagination(input.query.limit, input.query.offset, total),
    };
  },

  async closeSession(input: {
    distributorId: string;
    sessionId: string;
    actorUserId: string;
    payload: InventoryReconciliationSessionCloseInput;
  }) {
    const prisma = getPrisma();

    const result = await prisma.$transaction(async (tx) => {
      const lockedSession = await reconciliationSessionRepository.findSessionForUpdate(
        input.sessionId,
        input.distributorId,
        tx
      );

      if (!lockedSession) {
        throw new InventoryReconciliationSessionError(
          "SESSION_NOT_FOUND",
          "Sessão de conciliação não encontrada"
        );
      }

      if (lockedSession.status !== InventoryReconciliationStatus.OPEN) {
        throw new InventoryReconciliationSessionError(
          "SESSION_NOT_OPEN",
          "Sessão de conciliação não está aberta"
        );
      }

      const session = await reconciliationSessionRepository.findSessionForDistributor(
        input.sessionId,
        input.distributorId,
        tx
      );

      if (!session) {
        throw new InventoryReconciliationSessionError(
          "SESSION_NOT_FOUND",
          "Sessão de conciliação não encontrada"
        );
      }

      const countByItemId = assertCloseCountsMatchSession(session, input.payload);
      const deltas: Array<{
        item: (typeof session.items)[number];
        countedQuantity: number;
        currentQuantity: number;
        delta: number;
      }> = [];

      for (const item of session.items) {
        const countedQuantity = countByItemId.get(item.inventory_item_id)!;
        const currentBalance = await inventoryRepository.findBalanceForUpdate(
          input.distributorId,
          item.inventory_item_id,
          tx
        );

        const currentQuantity = currentBalance?.quantity_on_hand ?? 0;
        deltas.push({
          item,
          countedQuantity,
          currentQuantity,
          delta: countedQuantity - currentQuantity,
        });
      }
      const justification = requireJustificationIfNeeded(deltas, input.payload.justification);
      let adjustedCount = 0;

      for (const itemDelta of deltas) {
        let adjustmentMovementId: string | null = null;

        if (itemDelta.delta !== 0) {
          const movement = await inventoryService.applyMovement(
            {
              distributorId: input.distributorId,
              inventoryItemId: itemDelta.item.inventory_item_id,
              quantityDelta: itemDelta.delta,
              movementType: InventoryMovementType.RECONCILIATION_ADJUSTMENT,
              actor: { type: ActorType.DISTRIBUTOR_USER, id: input.actorUserId },
              sourceApp: SourceApp.DISTRIBUTOR_WEB,
              reference: {
                type: InventoryReferenceType.RECONCILIATION_SESSION,
                id: input.sessionId,
              },
              metadata: reconciliationMetadata({
                sessionId: input.sessionId,
                snapshotQuantity: itemDelta.item.snapshot_quantity,
                currentQuantity: itemDelta.currentQuantity,
                countedQuantity: itemDelta.countedQuantity,
                delta: itemDelta.delta,
              }),
            },
            tx
          );

          adjustmentMovementId = movement.movement.id;
          adjustedCount += 1;
        }

        await reconciliationSessionRepository.updateItemClose(
          {
            itemId: itemDelta.item.id,
            countedQuantity: itemDelta.countedQuantity,
            delta: itemDelta.delta,
            adjustmentMovementId,
          },
          tx
        );
      }

      const closedSession = await reconciliationSessionRepository.closeSession(
        {
          sessionId: input.sessionId,
          closedBy: input.actorUserId,
          justification,
          closedAt: new Date(),
        },
        tx
      );

      return { session: closedSession, adjustedCount };
    });

    return {
      session: sessionDetailResponse(result.session),
      adjusted_count: result.adjustedCount,
    };
  },

  async listSessionsForOps(query: OpsInventoryReconciliationSessionQueryInput) {
    const { sessions, total } = await reconciliationSessionRepository.listSessions({
      distributorId: query.distributor_id,
      status: query.status,
      start: toPeriodDate(query.start, "start"),
      end: toPeriodDate(query.end, "end"),
      limit: query.limit,
      offset: query.offset,
    });

    return {
      sessions: sessions.map(sessionListResponse),
      pagination: pagination(query.limit, query.offset, total),
    };
  },

  async getSessionForOps(sessionId: string) {
    const session = await reconciliationSessionRepository.findSessionById(sessionId);
    return session ? { session: sessionDetailResponse(session) } : null;
  },
};