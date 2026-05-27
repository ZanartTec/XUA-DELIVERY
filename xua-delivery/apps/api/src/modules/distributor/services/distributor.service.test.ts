import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import {
  inventoryBalanceQuerySchema,
  inventoryInitialLoadSchema,
  inventoryMovementQuerySchema,
} from "@xua/shared/schemas/inventory";
import { createHash } from "crypto";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  loggerInfo: vi.fn(),
  repository: {
    resolveDistributorId: vi.fn(),
    validateDistributorForZone: vi.fn(),
  },
  inventoryRepository: {
    findInitialLoadMovementsByBatch: vi.fn(),
    findInitialLoadMovementForItem: vi.fn(),
    listBalances: vi.fn(),
    listMovements: vi.fn(),
  },
  inventoryService: {
    applyMovement: vi.fn(),
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.loggerInfo }),
}));

vi.mock("../repository/distributor.repository.js", () => ({
  distributorRepository: mocks.repository,
}));

vi.mock("../../inventory/services/inventory.service.js", () => ({
  inventoryService: mocks.inventoryService,
}));

vi.mock("../../inventory/repository/inventory.repository.js", () => ({
  inventoryRepository: mocks.inventoryRepository,
}));

const { distributorService, DistributorServiceError } = await import("./distributor.service.js");

const tx = { tx: true };
const actorUserId = "7e1d7b55-3f52-4d10-aac3-74387c236101";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236102";
const inventoryItemId = "7e1d7b55-3f52-4d10-aac3-74387c236103";
const secondInventoryItemId = "7e1d7b55-3f52-4d10-aac3-74387c236104";
const batchId = "7e1d7b55-3f52-4d10-aac3-74387c236105";
const occurredAt = new Date("2026-05-26T10:30:00.000Z");

function initialLoadPayload(overrides: Record<string, unknown> = {}) {
  return inventoryInitialLoadSchema.parse({
    batch_id: batchId,
    batch_version: "rollout-piloto-1",
    observation: "Contagem inicial conferida pela operação",
    items: [
      { inventory_item_id: inventoryItemId, quantity: 8 },
      { inventory_item_id: secondInventoryItemId, quantity: 3 },
    ],
    ...overrides,
  });
}

function batchHash(items: Array<{ inventory_item_id: string; quantity: number }>) {
  const manifest = items
    .map((item) => ({ inventory_item_id: item.inventory_item_id, quantity: item.quantity }))
    .sort((left, right) => left.inventory_item_id.localeCompare(right.inventory_item_id));

  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function balanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "balance-1",
    distributor_id: distributorId,
    inventory_item_id: inventoryItemId,
    quantity_on_hand: 4,
    last_movement_at: occurredAt,
    created_at: occurredAt,
    updated_at: occurredAt,
    inventory_item: {
      id: inventoryItemId,
      code: "WATER20L",
      name: "Agua 20L",
      type: "SELLABLE_PRODUCT",
      unit_label: "un",
      low_stock_threshold: 5,
    },
    ...overrides,
  };
}

function movementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "movement-1",
    distributor_id: distributorId,
    inventory_item_id: inventoryItemId,
    quantity_delta: 4,
    movement_type: InventoryMovementType.INITIAL_LOAD,
    actor_type: ActorType.DISTRIBUTOR_USER,
    actor_id: actorUserId,
    source_app: SourceApp.DISTRIBUTOR_WEB,
    reference_type: InventoryReferenceType.INITIAL_LOAD,
    reference_id: batchId,
    metadata: { origin: "distributor_initial_load_endpoint" },
    occurred_at: occurredAt,
    inventory_item: {
      id: inventoryItemId,
      code: "WATER20L",
      name: "Agua 20L",
      type: "SELLABLE_PRODUCT",
      unit_label: "un",
      low_stock_threshold: 5,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
    callback(tx)
  );
  mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);
  mocks.inventoryRepository.findInitialLoadMovementsByBatch.mockResolvedValue([]);
  mocks.inventoryRepository.findInitialLoadMovementForItem.mockResolvedValue(null);
  mocks.inventoryRepository.listBalances.mockResolvedValue({
    balances: [balanceRow()],
    total: 1,
  });
  mocks.inventoryRepository.listMovements.mockResolvedValue({
    movements: [movementRow()],
    total: 1,
  });
  mocks.inventoryService.applyMovement.mockImplementation(
    async (input: { inventoryItemId: string; quantityDelta: number }) => ({
      movement: { id: `movement-${input.inventoryItemId}` },
      balance: {
        id: `balance-${input.inventoryItemId}`,
        quantity_on_hand: input.quantityDelta,
      },
      idempotentReplay: false,
    })
  );
});

describe("distributorService.listInventoryBalances", () => {
  it("lista saldos escopados pela distribuidora resolvida e calcula baixo estoque", async () => {
    const query = inventoryBalanceQuerySchema.parse({
      inventory_item_id: inventoryItemId,
      limit: "20",
      offset: "5",
    });

    const result = await distributorService.listInventoryBalances({ actorUserId, query });

    expect(mocks.repository.resolveDistributorId).toHaveBeenCalledWith(actorUserId);
    expect(mocks.inventoryRepository.listBalances).toHaveBeenCalledWith({
      distributorId,
      inventoryItemId,
      limit: 20,
      offset: 5,
    });
    expect(result).toEqual({
      balances: [
        {
          id: "balance-1",
          inventory_item_id: inventoryItemId,
          item: {
            id: inventoryItemId,
            code: "WATER20L",
            name: "Agua 20L",
            type: "SELLABLE_PRODUCT",
            unit_label: "un",
          },
          quantity_on_hand: 4,
          low_stock_threshold: 5,
          is_low_stock: true,
          last_movement_at: occurredAt,
          updated_at: occurredAt,
        },
      ],
      pagination: { limit: 20, offset: 5, total: 1 },
    });
  });

  it("bloqueia leitura de saldos quando usuario nao esta vinculado a distribuidora", async () => {
    mocks.repository.resolveDistributorId.mockResolvedValue(null);
    const query = inventoryBalanceQuerySchema.parse({});

    await expect(
      distributorService.listInventoryBalances({ actorUserId, query })
    ).rejects.toMatchObject({ code: "DISTRIBUTOR_NOT_LINKED" });

    expect(mocks.inventoryRepository.listBalances).not.toHaveBeenCalled();
  });
});

describe("distributorService.listInventoryMovements", () => {
  it("lista movimentos escopados com filtros por item, tipo e periodo", async () => {
    const query = inventoryMovementQuerySchema.parse({
      inventory_item_id: inventoryItemId,
      movement_type: InventoryMovementType.INITIAL_LOAD,
      start: "2026-05-26",
      end: "2026-05-26",
      limit: "10",
      offset: "0",
    });

    const result = await distributorService.listInventoryMovements({ actorUserId, query });

    expect(mocks.inventoryRepository.listMovements).toHaveBeenCalledWith({
      distributorId,
      inventoryItemId,
      movementType: InventoryMovementType.INITIAL_LOAD,
      start: new Date("2026-05-26T00:00:00.000Z"),
      end: new Date("2026-05-26T23:59:59.999Z"),
      limit: 10,
      offset: 0,
    });
    expect(result).toEqual({
      movements: [
        {
          id: "movement-1",
          inventory_item_id: inventoryItemId,
          item: {
            id: inventoryItemId,
            code: "WATER20L",
            name: "Agua 20L",
            type: "SELLABLE_PRODUCT",
            unit_label: "un",
          },
          quantity_delta: 4,
          movement_type: InventoryMovementType.INITIAL_LOAD,
          actor_type: ActorType.DISTRIBUTOR_USER,
          actor_id: actorUserId,
          source_app: SourceApp.DISTRIBUTOR_WEB,
          reference_type: InventoryReferenceType.INITIAL_LOAD,
          reference_id: batchId,
          metadata: { origin: "distributor_initial_load_endpoint" },
          occurred_at: occurredAt,
        },
      ],
      pagination: { limit: 10, offset: 0, total: 1 },
    });
  });
});

describe("distributorService.createInitialInventoryLoad", () => {
  it("registra carga inicial de um item novo", async () => {
    const payload = initialLoadPayload({
      items: [{ inventory_item_id: inventoryItemId, quantity: 6 }],
    });

    const result = await distributorService.createInitialInventoryLoad({ actorUserId, payload });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId,
        quantityDelta: 6,
        movementType: InventoryMovementType.INITIAL_LOAD,
      }),
      tx
    );
    expect(result).toMatchObject({
      applied_count: 1,
      skipped_count: 0,
      items: [
        {
          inventory_item_id: inventoryItemId,
          quantity: 6,
          quantity_on_hand: 6,
          skipped: false,
        },
      ],
    });
  });

  it("registra carga inicial em transacao usando applyMovement", async () => {
    const payload = initialLoadPayload();

    const result = await distributorService.createInitialInventoryLoad({ actorUserId, payload });

    expect(mocks.repository.resolveDistributorId).toHaveBeenCalledWith(actorUserId);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(mocks.inventoryService.applyMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        distributorId,
        inventoryItemId,
        quantityDelta: 8,
        movementType: InventoryMovementType.INITIAL_LOAD,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: actorUserId },
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        reference: { type: InventoryReferenceType.INITIAL_LOAD, id: batchId },
        metadata: {
          origin: "distributor_initial_load_endpoint",
          batch_id: batchId,
          batch_hash: expect.any(String),
          batch_version: "rollout-piloto-1",
          observation: "Contagem inicial conferida pela operação",
        },
      }),
      tx
    );
    expect(result).toMatchObject({
      distributor_id: distributorId,
      batch_id: batchId,
      applied_count: 2,
      replayed_count: 0,
      skipped_count: 0,
      items: [
        { inventory_item_id: inventoryItemId, quantity: 8, quantity_on_hand: 8 },
        { inventory_item_id: secondInventoryItemId, quantity: 3, quantity_on_hand: 3 },
      ],
    });
  });

  it("retorna replay quando o mesmo lote e reenviado com hash compativel", async () => {
    const payload = initialLoadPayload();
    mocks.inventoryRepository.findInitialLoadMovementsByBatch.mockResolvedValue([
      {
        metadata: {
          batch_hash: batchHash(payload.items),
        },
      },
    ]);
    mocks.inventoryService.applyMovement.mockResolvedValue({
      movement: { id: "movement-replay" },
      balance: { id: "balance-replay", quantity_on_hand: 8 },
      idempotentReplay: true,
    });

    const result = await distributorService.createInitialInventoryLoad({ actorUserId, payload });

    expect(result.replayed_count).toBe(2);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
  });

  it("rejeita mesmo batch_id com payload divergente", async () => {
    mocks.inventoryRepository.findInitialLoadMovementsByBatch.mockResolvedValue([
      { metadata: { batch_hash: "hash-antigo" } },
    ]);

    await expect(
      distributorService.createInitialInventoryLoad({ actorUserId, payload: initialLoadPayload() })
    ).rejects.toMatchObject({
      name: "DistributorServiceError",
      code: "INITIAL_LOAD_BATCH_CONFLICT",
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it("rejeita nova carga inicial para item ja inicializado em outro lote", async () => {
    mocks.inventoryRepository.findInitialLoadMovementForItem.mockResolvedValue({
      reference_id: "7e1d7b55-3f52-4d10-aac3-74387c236999",
    });

    await expect(
      distributorService.createInitialInventoryLoad({ actorUserId, payload: initialLoadPayload() })
    ).rejects.toMatchObject({
      name: "DistributorServiceError",
      code: "INITIAL_LOAD_ALREADY_EXISTS",
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it("ignora itens com quantidade zero sem criar movimento", async () => {
    const payload = initialLoadPayload({
      items: [
        { inventory_item_id: inventoryItemId, quantity: 0 },
        { inventory_item_id: secondInventoryItemId, quantity: 4 },
      ],
    });

    const result = await distributorService.createInitialInventoryLoad({ actorUserId, payload });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryItemId: secondInventoryItemId, quantityDelta: 4 }),
      tx
    );
    expect(result.skipped_count).toBe(1);
    expect(result.items[0]).toMatchObject({
      inventory_item_id: inventoryItemId,
      quantity: 0,
      movement_id: null,
      skipped: true,
    });
  });

  it("bloqueia carga quando usuario nao esta vinculado a distribuidora", async () => {
    mocks.repository.resolveDistributorId.mockResolvedValue(null);

    await expect(
      distributorService.createInitialInventoryLoad({ actorUserId, payload: initialLoadPayload() })
    ).rejects.toMatchObject({
      name: "DistributorServiceError",
      code: "DISTRIBUTOR_NOT_LINKED",
    });

    await expect(
      distributorService.createInitialInventoryLoad({ actorUserId, payload: initialLoadPayload() })
    ).rejects.toBeInstanceOf(DistributorServiceError);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it("propaga falha de applyMovement para rollback da transacao", async () => {
    const inventoryError = new Error("inventory item inactive");
    mocks.inventoryService.applyMovement.mockRejectedValueOnce(inventoryError);

    await expect(
      distributorService.createInitialInventoryLoad({ actorUserId, payload: initialLoadPayload() })
    ).rejects.toThrow(inventoryError);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("inventoryInitialLoadSchema", () => {
  it("rejeita distributor_id arbitrario nos filtros de leitura", () => {
    const balanceParsed = inventoryBalanceQuerySchema.safeParse({ distributor_id: distributorId });
    const movementParsed = inventoryMovementQuerySchema.safeParse({ distributor_id: distributorId });

    expect(balanceParsed.success).toBe(false);
    expect(movementParsed.success).toBe(false);
  });

  it("rejeita periodo de movimento invertido", () => {
    const parsed = inventoryMovementQuerySchema.safeParse({
      start: "2026-05-27",
      end: "2026-05-26",
    });

    expect(parsed.success).toBe(false);
  });

  it("exige batch_id para idempotencia de lote", () => {
    const parsed = inventoryInitialLoadSchema.safeParse({
      items: [{ inventory_item_id: inventoryItemId, quantity: 1 }],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejeita quantidade negativa", () => {
    const parsed = inventoryInitialLoadSchema.safeParse({
      batch_id: batchId,
      items: [{ inventory_item_id: inventoryItemId, quantity: -1 }],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejeita distributor_id arbitrario no payload", () => {
    const parsed = inventoryInitialLoadSchema.safeParse({
      batch_id: batchId,
      distributor_id: distributorId,
      items: [{ inventory_item_id: inventoryItemId, quantity: 1 }],
    });

    expect(parsed.success).toBe(false);
  });
});