import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import {
  inventoryBalanceQuerySchema,
  inventoryItemFilterSchema,
  inventoryInitialLoadSchema,
  inventoryMovementQuerySchema,
  inventoryReconciliationSessionQuerySchema,
} from "@xua/shared/schemas/inventory";
import { createHash } from "crypto";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  loggerInfo: vi.fn(),
  repository: {
    resolveDistributorId: vi.fn(),
    validateDistributorForZone: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createAdmin: vi.fn(),
    createDriver: vi.fn(),
    updateDriver: vi.fn(),
    findUnlinkedDrivers: vi.fn(),
    linkDriverToDistributor: vi.fn(),
    findDriverById: vi.fn(),
  },
  inventoryRepository: {
    findInitialLoadMovementsByBatch: vi.fn(),
    findInitialLoadMovementForItem: vi.fn(),
    listBalances: vi.fn(),
    listInventoryItems: vi.fn(),
    listMovements: vi.fn(),
  },
  reconciliationSessionService: {
    listSessionsForDistributor: vi.fn(),
  },
  inventoryService: {
    applyMovement: vi.fn(),
  },
  hashPassword: vi.fn(),
  markAccountDeactivated: vi.fn(),
  auditRepository: {
    emit: vi.fn(),
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

vi.mock("../../inventory/services/reconciliation-session.service.js", () => ({
  inventoryReconciliationSessionService: mocks.reconciliationSessionService,
}));

vi.mock("../../../infra/auth/password.js", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("../../../infra/auth/password-change.js", () => ({
  markAccountDeactivated: mocks.markAccountDeactivated,
}));

vi.mock("../../audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
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
      is_active: true,
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
      is_active: true,
    },
    ...overrides,
  };
}

function inventoryItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: inventoryItemId,
    code: "WATER20L",
    name: "Agua 20L",
    type: "SELLABLE_PRODUCT",
    product_id: null,
    unit_label: "un",
    low_stock_threshold: 5,
    is_active: true,
    created_at: occurredAt,
    updated_at: occurredAt,
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
  mocks.inventoryRepository.listInventoryItems.mockResolvedValue({
    items: [inventoryItemRow()],
    total: 1,
  });
  mocks.inventoryRepository.listMovements.mockResolvedValue({
    movements: [movementRow()],
    total: 1,
  });
  mocks.reconciliationSessionService.listSessionsForDistributor.mockResolvedValue({
    sessions: [{ id: "session-1", distributor_id: distributorId, status: "OPEN" }],
    pagination: { limit: 20, offset: 0, total: 1 },
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
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.auditRepository.emit.mockResolvedValue(undefined);
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
      isActive: true,
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
            is_active: true,
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

  it("repassa isActive=false ao repositorio para consultar itens inativos", async () => {
    const query = inventoryBalanceQuerySchema.parse({
      is_active: "false",
      limit: "20",
      offset: "0",
    });

    await distributorService.listInventoryBalances({ actorUserId, query });

    expect(mocks.inventoryRepository.listBalances).toHaveBeenCalledWith(
      expect.objectContaining({ distributorId, isActive: false })
    );
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
            is_active: true,
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

describe("distributorService.listInventoryItems", () => {
  it("exige vinculo de distribuidora antes de listar catalogo ativo", async () => {
    const query = inventoryItemFilterSchema.parse({ q: "agua", limit: "100", offset: "0" });

    const result = await distributorService.listInventoryItems({ actorUserId, query });

    expect(mocks.repository.resolveDistributorId).toHaveBeenCalledWith(actorUserId);
    expect(mocks.inventoryRepository.listInventoryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "agua",
        isActive: true,
        limit: 100,
        offset: 0,
      })
    );
    expect(result).toEqual({
      items: [inventoryItemRow()],
      pagination: { limit: 100, offset: 0, total: 1 },
    });
  });

  it("bloqueia listagem de catalogo quando usuario nao esta vinculado", async () => {
    mocks.repository.resolveDistributorId.mockResolvedValue(null);
    const query = inventoryItemFilterSchema.parse({});

    await expect(
      distributorService.listInventoryItems({ actorUserId, query })
    ).rejects.toMatchObject({ code: "DISTRIBUTOR_NOT_LINKED" });

    expect(mocks.inventoryRepository.listInventoryItems).not.toHaveBeenCalled();
  });
});

describe("distributorService.listInventoryReconciliationSessions", () => {
  it("lista sessoes somente para a distribuidora resolvida", async () => {
    const query = inventoryReconciliationSessionQuerySchema.parse({
      status: "OPEN",
      limit: "20",
      offset: "0",
    });

    const result = await distributorService.listInventoryReconciliationSessions({
      actorUserId,
      query,
    });

    expect(mocks.reconciliationSessionService.listSessionsForDistributor).toHaveBeenCalledWith({
      distributorId,
      query,
    });
    expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
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

const opsUserId = "7e1d7b55-3f52-4d10-aac3-74387c236201";
const distributorAdminUserId = "7e1d7b55-3f52-4d10-aac3-74387c236202";
const driverId = "7e1d7b55-3f52-4d10-aac3-74387c236203";

describe("distributorService.createDistributor", () => {
  it("cria distribuidora e primeiro admin numa unica transacao, emitindo DISTRIBUTOR_CREATED", async () => {
    mocks.repository.create.mockResolvedValue({ id: distributorId, name: "São Luiz" });
    mocks.repository.createAdmin.mockResolvedValue({ id: "admin-1", email: "admin@saoluiz.test" });

    const result = await distributorService.createDistributor(
      {
        name: "São Luiz",
        cnpj: "11222333000181",
        phone: "11988887777",
        email: "contato@saoluiz.test",
        admin_name: "Admin São Luiz",
        admin_email: "admin@saoluiz.test",
        admin_phone: "11988886666",
        admin_password: "senha1234",
      } as any,
      opsUserId
    );

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.hashPassword).toHaveBeenCalledWith("senha1234");
    expect(mocks.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "São Luiz", cnpj: "11222333000181" }),
      tx
    );
    expect(mocks.repository.createAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Admin São Luiz",
        email: "admin@saoluiz.test",
        password_hash: "hashed-password",
        distributor_id: distributorId,
      }),
      tx
    );
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "DISTRIBUTOR_CREATED",
        actor: { type: ActorType.OPS, id: opsUserId },
      }),
      tx
    );
    expect(result).toEqual({
      distributor: { id: distributorId, name: "São Luiz" },
      admin: { id: "admin-1", email: "admin@saoluiz.test" },
    });
  });

  it("rejeita CNPJ ou e-mail duplicado (P2002) como erro de negocio 409", async () => {
    mocks.transaction.mockImplementationOnce(async () => {
      throw { code: "P2002" };
    });

    await expect(
      distributorService.createDistributor(
        {
          name: "São Luiz",
          cnpj: "11222333000181",
          phone: "11988887777",
          email: "contato@saoluiz.test",
          admin_name: "Admin",
          admin_email: "admin@saoluiz.test",
          admin_phone: "11988886666",
          admin_password: "senha1234",
        } as any,
        opsUserId
      )
    ).rejects.toMatchObject({ name: "DistributorServiceError", code: "DUPLICATE_DISTRIBUTOR" });
  });
});

describe("distributorService.updateDistributor", () => {
  it("atualiza distribuidora e emite DISTRIBUTOR_UPDATED", async () => {
    mocks.repository.update.mockResolvedValue({ id: distributorId, is_active: false });

    const result = await distributorService.updateDistributor(
      distributorId,
      { is_active: false } as any,
      opsUserId
    );

    expect(mocks.repository.update).toHaveBeenCalledWith(distributorId, { is_active: false }, tx);
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "DISTRIBUTOR_UPDATED" }),
      tx
    );
    expect(result).toEqual({ id: distributorId, is_active: false });
  });
});

describe("distributorService.createDriver", () => {
  it("distributor_admin: resolve distributor_id via resolveDistributorId e ignora o do body", async () => {
    mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.repository.createDriver.mockResolvedValue({ id: driverId, distributor_id: distributorId });

    const outraDistribuidora = "7e1d7b55-3f52-4d10-aac3-74387c236299";
    const result = await distributorService.createDriver(
      { sub: distributorAdminUserId, role: "distributor_admin" },
      {
        name: "Motorista 1",
        email: "motorista1@xua.test",
        password: "senha1234",
        distributor_id: outraDistribuidora,
      } as any
    );

    expect(mocks.repository.resolveDistributorId).toHaveBeenCalledWith(distributorAdminUserId);
    expect(mocks.repository.createDriver).toHaveBeenCalledWith(
      expect.objectContaining({ distributor_id: distributorId }),
      tx
    );
    expect(mocks.repository.createDriver).not.toHaveBeenCalledWith(
      expect.objectContaining({ distributor_id: outraDistribuidora }),
      tx
    );
    expect(result).toEqual({ id: driverId, distributor_id: distributorId });
  });

  it("ops: exige distributor_id no body", async () => {
    await expect(
      distributorService.createDriver(
        { sub: opsUserId, role: "ops" },
        { name: "Motorista 1", email: "motorista1@xua.test", password: "senha1234" } as any
      )
    ).rejects.toMatchObject({ name: "DistributorServiceError", code: "DISTRIBUTOR_ID_REQUIRED" });

    expect(mocks.repository.createDriver).not.toHaveBeenCalled();
  });

  it("rejeita e-mail duplicado (P2002) como erro de negocio 409", async () => {
    mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.transaction.mockImplementationOnce(async () => {
      throw { code: "P2002" };
    });

    await expect(
      distributorService.createDriver(
        { sub: distributorAdminUserId, role: "distributor_admin" },
        { name: "Motorista 1", email: "motorista1@xua.test", password: "senha1234" } as any
      )
    ).rejects.toMatchObject({ name: "DistributorServiceError", code: "DUPLICATE_DRIVER_EMAIL" });
  });
});

describe("distributorService.updateDriver", () => {
  it("distributor_admin: bloqueia edicao de motorista de outra distribuidora", async () => {
    mocks.repository.findDriverById.mockResolvedValue({
      id: driverId,
      distributor_id: "7e1d7b55-3f52-4d10-aac3-74387c236299",
    });
    mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);

    await expect(
      distributorService.updateDriver(
        { sub: distributorAdminUserId, role: "distributor_admin" },
        driverId,
        { is_active: false } as any
      )
    ).rejects.toMatchObject({
      name: "DistributorServiceError",
      code: "DRIVER_NOT_OWNED_BY_DISTRIBUTOR",
    });

    expect(mocks.repository.updateDriver).not.toHaveBeenCalled();
  });

  it("distributor_admin: permite editar motorista da propria distribuidora", async () => {
    mocks.repository.findDriverById.mockResolvedValue({ id: driverId, distributor_id: distributorId });
    mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.repository.updateDriver.mockResolvedValue({ id: driverId, is_active: false });

    const result = await distributorService.updateDriver(
      { sub: distributorAdminUserId, role: "distributor_admin" },
      driverId,
      { is_active: false } as any
    );

    expect(mocks.repository.updateDriver).toHaveBeenCalledWith(driverId, { is_active: false }, tx);
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "DRIVER_UPDATED" }),
      tx
    );
    expect(result).toEqual({ id: driverId, is_active: false });
  });

  it("rejeita motorista inexistente", async () => {
    mocks.repository.findDriverById.mockResolvedValue(null);

    await expect(
      distributorService.updateDriver({ sub: opsUserId, role: "ops" }, driverId, { is_active: false } as any)
    ).rejects.toMatchObject({ name: "DistributorServiceError", code: "DRIVER_NOT_FOUND" });
  });

  it("SEC: desativar motorista (is_active=false) invalida sessoes JWT ja emitidas", async () => {
    mocks.repository.findDriverById.mockResolvedValue({ id: driverId, distributor_id: distributorId });
    mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.repository.updateDriver.mockResolvedValue({ id: driverId, is_active: false });
    mocks.markAccountDeactivated.mockClear();

    await distributorService.updateDriver(
      { sub: distributorAdminUserId, role: "distributor_admin" },
      driverId,
      { is_active: false } as any
    );

    expect(mocks.markAccountDeactivated).toHaveBeenCalledWith(driverId);
  });

  it("SEC: nao invalida sessoes quando a atualizacao nao desativa a conta", async () => {
    mocks.repository.findDriverById.mockResolvedValue({ id: driverId, distributor_id: distributorId });
    mocks.repository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.repository.updateDriver.mockResolvedValue({ id: driverId, name: "Novo Nome" });
    mocks.markAccountDeactivated.mockClear();

    await distributorService.updateDriver(
      { sub: distributorAdminUserId, role: "distributor_admin" },
      driverId,
      { name: "Novo Nome" } as any
    );

    expect(mocks.markAccountDeactivated).not.toHaveBeenCalled();
  });
});

describe("distributorService.listUnlinkedDrivers", () => {
  it("delega ao repositorio sem logica de auto-vinculacao", async () => {
    mocks.repository.findUnlinkedDrivers.mockResolvedValue([{ id: driverId, distributor_id: null }]);

    const result = await distributorService.listUnlinkedDrivers();

    expect(mocks.repository.findUnlinkedDrivers).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: driverId, distributor_id: null }]);
  });
});

describe("distributorService.linkDriver", () => {
  it("vincula motorista orfao e emite DRIVER_LINKED_TO_DISTRIBUTOR", async () => {
    mocks.repository.findDriverById.mockResolvedValue({ id: driverId, distributor_id: null });
    mocks.repository.linkDriverToDistributor.mockResolvedValue({
      id: driverId,
      distributor_id: distributorId,
    });

    const result = await distributorService.linkDriver(driverId, distributorId, opsUserId);

    expect(mocks.repository.linkDriverToDistributor).toHaveBeenCalledWith(driverId, distributorId, tx);
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "DRIVER_LINKED_TO_DISTRIBUTOR",
        actor: { type: ActorType.OPS, id: opsUserId },
      }),
      tx
    );
    expect(result).toEqual({ id: driverId, distributor_id: distributorId });
  });

  it("rejeita vinculacao de motorista inexistente", async () => {
    mocks.repository.findDriverById.mockResolvedValue(null);

    await expect(distributorService.linkDriver(driverId, distributorId, opsUserId)).rejects.toMatchObject({
      name: "DistributorServiceError",
      code: "DRIVER_NOT_FOUND",
    });

    expect(mocks.repository.linkDriverToDistributor).not.toHaveBeenCalled();
  });
});