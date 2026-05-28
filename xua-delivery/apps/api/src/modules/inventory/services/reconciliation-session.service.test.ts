import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  InventoryMovementType,
  InventoryReconciliationStatus,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import {
  inventoryReconciliationSessionCloseSchema,
  opsInventoryReconciliationSessionQuerySchema,
} from "@xua/shared/schemas/inventory";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  inventoryRepository: {
    findDistributor: vi.fn(),
    findBalanceForUpdate: vi.fn(),
  },
  reconciliationRepository: {
    findOpenSession: vi.fn(),
    listSnapshotBalances: vi.fn(),
    createOpenSession: vi.fn(),
    findSessionForDistributor: vi.fn(),
    findSessionById: vi.fn(),
    findSessionForUpdate: vi.fn(),
    updateItemClose: vi.fn(),
    closeSession: vi.fn(),
    listSessions: vi.fn(),
  },
  inventoryService: {
    applyMovement: vi.fn(),
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../repository/inventory.repository.js", () => ({
  inventoryRepository: mocks.inventoryRepository,
}));

vi.mock("../repository/reconciliation-session.repository.js", () => ({
  reconciliationSessionRepository: mocks.reconciliationRepository,
}));

vi.mock("./inventory.service.js", () => ({
  inventoryService: mocks.inventoryService,
}));

const { inventoryReconciliationSessionService } = await import(
  "./reconciliation-session.service.js"
);

const tx = { tx: true };
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236801";
const actorUserId = "7e1d7b55-3f52-4d10-aac3-74387c236802";
const sessionId = "7e1d7b55-3f52-4d10-aac3-74387c236803";
const itemA = "7e1d7b55-3f52-4d10-aac3-74387c236804";
const itemB = "7e1d7b55-3f52-4d10-aac3-74387c236805";
const openedAt = new Date("2026-05-27T10:00:00.000Z");
const closedAt = new Date("2026-05-27T11:00:00.000Z");

function itemRead(id: string, code: string) {
  return {
    id,
    code,
    name: code,
    type: "SELLABLE_PRODUCT",
    unit_label: "un",
    low_stock_threshold: 5,
  };
}

function sessionItem(overrides: Record<string, unknown> = {}) {
  const inventoryItemId = (overrides.inventory_item_id as string | undefined) ?? itemA;
  return {
    id: `session-item-${inventoryItemId}`,
    inventory_item_id: inventoryItemId,
    snapshot_quantity: 10,
    counted_quantity: null,
    delta: null,
    adjustment_movement_id: null,
    inventory_item: itemRead(inventoryItemId, inventoryItemId === itemA ? "WATER20L" : "EMPTY20L"),
    adjustment_movement: null,
    ...overrides,
  };
}

function sessionRead(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    distributor_id: distributorId,
    status: InventoryReconciliationStatus.OPEN,
    opened_by: actorUserId,
    closed_by: null,
    justification: null,
    opened_at: openedAt,
    closed_at: null,
    created_at: openedAt,
    updated_at: openedAt,
    distributor: { id: distributorId, name: "XUA Centro" },
    items: [
      sessionItem({ inventory_item_id: itemA, snapshot_quantity: 10 }),
      sessionItem({ inventory_item_id: itemB, snapshot_quantity: 3 }),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
    callback(tx)
  );
  mocks.inventoryRepository.findDistributor.mockResolvedValue({ id: distributorId, is_active: true });
  mocks.inventoryRepository.findBalanceForUpdate.mockImplementation(
    async (_distributorId: string, inventoryItemId: string) => ({
      inventory_item_id: inventoryItemId,
      quantity_on_hand: inventoryItemId === itemA ? 10 : 3,
    })
  );
  mocks.reconciliationRepository.findOpenSession.mockResolvedValue(null);
  mocks.reconciliationRepository.listSnapshotBalances.mockResolvedValue([
    { inventory_item_id: itemA, quantity_on_hand: 10 },
    { inventory_item_id: itemB, quantity_on_hand: 3 },
  ]);
  mocks.reconciliationRepository.createOpenSession.mockResolvedValue(sessionRead());
  mocks.reconciliationRepository.findSessionForUpdate.mockResolvedValue({
    id: sessionId,
    distributor_id: distributorId,
    status: InventoryReconciliationStatus.OPEN,
  });
  mocks.reconciliationRepository.findSessionForDistributor.mockResolvedValue(sessionRead());
  mocks.reconciliationRepository.findSessionById.mockResolvedValue(sessionRead());
  mocks.reconciliationRepository.updateItemClose.mockResolvedValue({});
  mocks.reconciliationRepository.closeSession.mockResolvedValue(
    sessionRead({
      status: InventoryReconciliationStatus.CLOSED,
      closed_by: actorUserId,
      justification: "Contagem física validada",
      closed_at: closedAt,
      items: [
        sessionItem({
          inventory_item_id: itemA,
          snapshot_quantity: 10,
          counted_quantity: 12,
          delta: 2,
          adjustment_movement_id: "movement-a",
          adjustment_movement: {
            id: "movement-a",
            quantity_delta: 2,
            occurred_at: closedAt,
          },
        }),
        sessionItem({
          inventory_item_id: itemB,
          snapshot_quantity: 3,
          counted_quantity: 3,
          delta: 0,
        }),
      ],
    })
  );
  mocks.reconciliationRepository.listSessions.mockResolvedValue({
    sessions: [{ ...sessionRead(), _count: { items: 2 } }],
    total: 1,
  });
  mocks.inventoryService.applyMovement.mockResolvedValue({
    movement: { id: "movement-a" },
    balance: { id: "balance-a", quantity_on_hand: 12 },
    idempotentReplay: false,
  });
});

describe("inventoryReconciliationSessionService.openSession", () => {
  it("abre sessao com snapshot dos saldos materializados", async () => {
    const result = await inventoryReconciliationSessionService.openSession({
      distributorId,
      actorUserId,
    });

    expect(mocks.reconciliationRepository.findOpenSession).toHaveBeenCalledWith(distributorId, tx);
    expect(mocks.reconciliationRepository.listSnapshotBalances).toHaveBeenCalledWith(distributorId, tx);
    expect(mocks.reconciliationRepository.createOpenSession).toHaveBeenCalledWith(
      {
        distributorId,
        openedBy: actorUserId,
        snapshotBalances: [
          { inventory_item_id: itemA, quantity_on_hand: 10 },
          { inventory_item_id: itemB, quantity_on_hand: 3 },
        ],
      },
      tx
    );
    expect(result.session.items).toHaveLength(2);
    expect(result.session.items[0]).toMatchObject({
      inventory_item_id: itemA,
      snapshot_quantity: 10,
    });
    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it("bloqueia nova sessao quando ja existe OPEN", async () => {
    mocks.reconciliationRepository.findOpenSession.mockResolvedValue({ id: sessionId });

    await expect(
      inventoryReconciliationSessionService.openSession({ distributorId, actorUserId })
    ).rejects.toMatchObject({ code: "OPEN_SESSION_EXISTS" });

    expect(mocks.reconciliationRepository.createOpenSession).not.toHaveBeenCalled();
  });
});

describe("inventoryReconciliationSessionService.closeSession", () => {
  it("fecha sessao e aplica apenas deltas divergentes via applyMovement no mesmo tx", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      justification: "Contagem física validada",
      counts: [
        { inventory_item_id: itemA, counted_quantity: 12 },
        { inventory_item_id: itemB, counted_quantity: 3 },
      ],
    });

    const result = await inventoryReconciliationSessionService.closeSession({
      distributorId,
      sessionId,
      actorUserId,
      payload,
    });

    expect(mocks.reconciliationRepository.findSessionForUpdate).toHaveBeenCalledWith(
      sessionId,
      distributorId,
      tx
    );
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        distributorId,
        inventoryItemId: itemA,
        quantityDelta: 2,
        movementType: InventoryMovementType.RECONCILIATION_ADJUSTMENT,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: actorUserId },
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        reference: { type: InventoryReferenceType.RECONCILIATION_SESSION, id: sessionId },
        metadata: {
          origin: "inventory_reconciliation_session_close",
          session_id: sessionId,
          snapshot_quantity: 10,
          current_quantity: 10,
          counted_quantity: 12,
          delta: 2,
        },
      }),
      tx
    );
    expect(mocks.reconciliationRepository.updateItemClose).toHaveBeenCalledTimes(2);
    expect(mocks.reconciliationRepository.closeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        closedBy: actorUserId,
        justification: "Contagem física validada",
      }),
      tx
    );
    expect(result.adjusted_count).toBe(1);
  });

  it("nao fecha nem edita itens quando ajuste de inventory falha", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      justification: "Contagem física validada",
      counts: [
        { inventory_item_id: itemA, counted_quantity: 12 },
        { inventory_item_id: itemB, counted_quantity: 3 },
      ],
    });
    const inventoryError = new Error("ledger indisponivel");
    mocks.inventoryService.applyMovement.mockRejectedValueOnce(inventoryError);

    await expect(
      inventoryReconciliationSessionService.closeSession({
        distributorId,
        sessionId,
        actorUserId,
        payload,
      })
    ).rejects.toThrow(inventoryError);

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(mocks.reconciliationRepository.updateItemClose).not.toHaveBeenCalled();
    expect(mocks.reconciliationRepository.closeSession).not.toHaveBeenCalled();
  });

  it("fecha sessao sem divergencia sem criar movimentos de ajuste", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      counts: [
        { inventory_item_id: itemA, counted_quantity: 10 },
        { inventory_item_id: itemB, counted_quantity: 3 },
      ],
    });

    mocks.reconciliationRepository.closeSession.mockResolvedValueOnce(
      sessionRead({
        status: InventoryReconciliationStatus.CLOSED,
        closed_by: actorUserId,
        closed_at: closedAt,
        items: [
          sessionItem({ inventory_item_id: itemA, snapshot_quantity: 10, counted_quantity: 10, delta: 0 }),
          sessionItem({ inventory_item_id: itemB, snapshot_quantity: 3, counted_quantity: 3, delta: 0 }),
        ],
      })
    );

    const result = await inventoryReconciliationSessionService.closeSession({
      distributorId,
      sessionId,
      actorUserId,
      payload,
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.reconciliationRepository.updateItemClose).toHaveBeenCalledTimes(2);
    expect(mocks.reconciliationRepository.closeSession).toHaveBeenCalledWith(
      expect.objectContaining({ justification: null }),
      tx
    );
    expect(result.adjusted_count).toBe(0);
  });

  it("calcula ajuste contra saldo atual quando o snapshot ficou defasado", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      counts: [
        { inventory_item_id: itemA, counted_quantity: 8 },
        { inventory_item_id: itemB, counted_quantity: 3 },
      ],
    });
    mocks.inventoryRepository.findBalanceForUpdate.mockImplementation(
      async (_distributorId: string, inventoryItemId: string) => ({
        inventory_item_id: inventoryItemId,
        quantity_on_hand: inventoryItemId === itemA ? 8 : 3,
      })
    );
    mocks.reconciliationRepository.closeSession.mockResolvedValueOnce(
      sessionRead({
        status: InventoryReconciliationStatus.CLOSED,
        closed_by: actorUserId,
        closed_at: closedAt,
        items: [
          sessionItem({ inventory_item_id: itemA, snapshot_quantity: 10, counted_quantity: 8, delta: 0 }),
          sessionItem({ inventory_item_id: itemB, snapshot_quantity: 3, counted_quantity: 3, delta: 0 }),
        ],
      })
    );

    const result = await inventoryReconciliationSessionService.closeSession({
      distributorId,
      sessionId,
      actorUserId,
      payload,
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.reconciliationRepository.updateItemClose).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: `session-item-${itemA}`,
        countedQuantity: 8,
        delta: 0,
      }),
      tx
    );
    expect(result.adjusted_count).toBe(0);
  });

  it("rejeita fechamento de sessao ja fechada sem editar itens ou criar ajuste", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      justification: "Contagem física validada",
      counts: [
        { inventory_item_id: itemA, counted_quantity: 12 },
        { inventory_item_id: itemB, counted_quantity: 3 },
      ],
    });
    mocks.reconciliationRepository.findSessionForUpdate.mockResolvedValueOnce({
      id: sessionId,
      distributor_id: distributorId,
      status: InventoryReconciliationStatus.CLOSED,
    });

    await expect(
      inventoryReconciliationSessionService.closeSession({
        distributorId,
        sessionId,
        actorUserId,
        payload,
      })
    ).rejects.toMatchObject({ code: "SESSION_NOT_OPEN" });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.reconciliationRepository.updateItemClose).not.toHaveBeenCalled();
    expect(mocks.reconciliationRepository.closeSession).not.toHaveBeenCalled();
  });

  it("exige justificativa quando ha divergencia", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      counts: [
        { inventory_item_id: itemA, counted_quantity: 12 },
        { inventory_item_id: itemB, counted_quantity: 3 },
      ],
    });

    await expect(
      inventoryReconciliationSessionService.closeSession({
        distributorId,
        sessionId,
        actorUserId,
        payload,
      })
    ).rejects.toMatchObject({ code: "JUSTIFICATION_REQUIRED" });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.reconciliationRepository.closeSession).not.toHaveBeenCalled();
  });

  it("rejeita fechamento com contagem incompleta ou item fora do snapshot", async () => {
    const payload = inventoryReconciliationSessionCloseSchema.parse({
      justification: "Contagem física validada",
      counts: [{ inventory_item_id: itemA, counted_quantity: 12 }],
    });

    await expect(
      inventoryReconciliationSessionService.closeSession({
        distributorId,
        sessionId,
        actorUserId,
        payload,
      })
    ).rejects.toMatchObject({ code: "COUNT_ITEMS_MISMATCH" });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it("schema rejeita contagens negativas e duplicadas", () => {
    expect(
      inventoryReconciliationSessionCloseSchema.safeParse({
        counts: [{ inventory_item_id: itemA, counted_quantity: -1 }],
      }).success
    ).toBe(false);

    expect(
      inventoryReconciliationSessionCloseSchema.safeParse({
        counts: [
          { inventory_item_id: itemA, counted_quantity: 1 },
          { inventory_item_id: itemA, counted_quantity: 2 },
        ],
      }).success
    ).toBe(false);
  });
});

describe("inventoryReconciliationSessionService.listSessionsForOps", () => {
  it("lista sessoes OPS com filtros e paginacao", async () => {
    const query = opsInventoryReconciliationSessionQuerySchema.parse({
      distributor_id: distributorId,
      status: InventoryReconciliationStatus.OPEN,
      start: "2026-05-27",
      end: "2026-05-27",
      limit: "10",
      offset: "0",
    });

    const result = await inventoryReconciliationSessionService.listSessionsForOps(query);

    expect(mocks.reconciliationRepository.listSessions).toHaveBeenCalledWith({
      distributorId,
      status: InventoryReconciliationStatus.OPEN,
      start: new Date("2026-05-27T00:00:00.000Z"),
      end: new Date("2026-05-27T23:59:59.999Z"),
      limit: 10,
      offset: 0,
    });
    expect(result.sessions[0]).toMatchObject({
      id: sessionId,
      distributor_id: distributorId,
      distributor_name: "XUA Centro",
      item_count: 2,
    });
  });
});