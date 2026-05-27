import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  repository: {
    findDistributor: vi.fn(),
    findInventoryItem: vi.fn(),
    findBalance: vi.fn(),
    findBalanceForUpdate: vi.fn(),
    findMovementByReference: vi.fn(),
    createMovement: vi.fn(),
    createMovementOnce: vi.fn(),
    upsertBalance: vi.fn(),
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}));

vi.mock("../repository/inventory.repository.js", () => ({
  inventoryRepository: mocks.repository,
}));

const { inventoryService, InventoryServiceError } = await import("./inventory.service.js");

const tx = { tx: true };
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236001";
const inventoryItemId = "7e1d7b55-3f52-4d10-aac3-74387c236002";
const actorId = "user-1";
const referenceId = "order-1";

function baseInput(quantityDelta: number) {
  return {
    distributorId,
    inventoryItemId,
    quantityDelta,
    movementType: InventoryMovementType.INITIAL_LOAD,
    actor: { type: ActorType.OPS, id: actorId },
    sourceApp: SourceApp.OPS_CONSOLE,
    reference: { type: InventoryReferenceType.INITIAL_LOAD, id: referenceId },
    metadata: { batch: "initial-load-1" },
    occurredAt: new Date("2026-05-26T12:00:00.000Z"),
  };
}

function distributor(overrides: Record<string, unknown> = {}) {
  return { id: distributorId, is_active: true, ...overrides };
}

function inventoryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: inventoryItemId,
    code: "WATER20L",
    name: "Agua 20L",
    type: "SELLABLE_PRODUCT",
    product_id: null,
    is_active: true,
    ...overrides,
  };
}

function balance(quantityOnHand: number) {
  return {
    id: "balance-1",
    distributor_id: distributorId,
    inventory_item_id: inventoryItemId,
    quantity_on_hand: quantityOnHand,
    last_movement_at: new Date("2026-05-26T12:00:00.000Z"),
    created_at: new Date("2026-05-26T12:00:00.000Z"),
    updated_at: new Date("2026-05-26T12:00:00.000Z"),
  };
}

function movement(quantityDelta: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "movement-1",
    distributor_id: distributorId,
    inventory_item_id: inventoryItemId,
    quantity_delta: quantityDelta,
    movement_type: InventoryMovementType.INITIAL_LOAD,
    actor_type: ActorType.OPS,
    actor_id: actorId,
    source_app: SourceApp.OPS_CONSOLE,
    reference_type: InventoryReferenceType.INITIAL_LOAD,
    reference_id: referenceId,
    metadata: { batch: "initial-load-1" },
    occurred_at: new Date("2026-05-26T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.repository.findDistributor.mockResolvedValue(distributor());
  mocks.repository.findInventoryItem.mockResolvedValue(inventoryItem());
  mocks.repository.findMovementByReference.mockResolvedValue(null);
  mocks.repository.findBalance.mockResolvedValue(balance(10));
  mocks.repository.findBalanceForUpdate.mockResolvedValue(balance(10));
  mocks.repository.createMovement.mockResolvedValue(movement(5));
  mocks.repository.createMovementOnce.mockResolvedValue(movement(5));
  mocks.repository.upsertBalance.mockResolvedValue(balance(15));
});

describe("inventoryService.applyMovement", () => {
  it("aplica entrada positiva e atualiza saldo na mesma transacao", async () => {
    mocks.repository.findBalanceForUpdate.mockResolvedValue(null);
    const input = baseInput(5);

    const result = await inventoryService.applyMovement(input);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.repository.createMovementOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        distributor_id: distributorId,
        inventory_item_id: inventoryItemId,
        quantity_delta: 5,
        movement_type: InventoryMovementType.INITIAL_LOAD,
        actor_type: ActorType.OPS,
        actor_id: actorId,
        source_app: SourceApp.OPS_CONSOLE,
        reference_type: InventoryReferenceType.INITIAL_LOAD,
        reference_id: referenceId,
        metadata: { batch: "initial-load-1" },
      }),
      tx
    );
    expect(mocks.repository.upsertBalance).toHaveBeenCalledWith(
      distributorId,
      inventoryItemId,
      5,
      input.occurredAt,
      tx
    );
    expect(result).toEqual({
      movement: movement(5),
      balance: balance(15),
      idempotentReplay: false,
    });
  });

  it("aplica saida quando ha saldo suficiente", async () => {
    const outputMovement = movement(-3);
    const outputBalance = balance(7);
    mocks.repository.createMovementOnce.mockResolvedValue(outputMovement);
    mocks.repository.upsertBalance.mockResolvedValue(outputBalance);

    const result = await inventoryService.applyMovement(
      {
        ...baseInput(-3),
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        reference: { type: InventoryReferenceType.ORDER, id: "order-1" },
      },
      tx as never
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).toHaveBeenCalledWith(
      distributorId,
      inventoryItemId,
      -3,
      expect.any(Date),
      tx
    );
    expect(result).toEqual({
      movement: outputMovement,
      balance: outputBalance,
      idempotentReplay: false,
    });
  });

  it("bloqueia saida que deixaria saldo negativo", async () => {
    mocks.repository.findBalanceForUpdate.mockResolvedValue(balance(2));

    await expect(
      inventoryService.applyMovement({
        ...baseInput(-3),
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        reference: { type: InventoryReferenceType.ORDER, id: "order-1" },
      })
    ).rejects.toMatchObject({
      name: "InventoryServiceError",
      code: "STOCK_UNAVAILABLE",
    });

    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1);
  });

  it("retorna replay idempotente sem alterar saldo quando a referencia ja existe", async () => {
    const existingMovement = movement(-2, {
      movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
      reference_type: InventoryReferenceType.ORDER,
    });
    const existingBalance = balance(8);
    mocks.repository.findMovementByReference.mockResolvedValue(existingMovement);
    mocks.repository.findBalance.mockResolvedValue(existingBalance);

    const result = await inventoryService.applyMovement({
      ...baseInput(-2),
      movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
      reference: { type: InventoryReferenceType.ORDER, id: "order-1" },
    });

    expect(mocks.repository.findBalanceForUpdate).not.toHaveBeenCalled();
    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
    expect(result).toEqual({
      movement: existingMovement,
      balance: existingBalance,
      idempotentReplay: true,
    });
  });

  it("rejeita replay idempotente com payload divergente", async () => {
    const existingMovement = movement(-2, {
      movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
      reference_type: InventoryReferenceType.ORDER,
    });
    mocks.repository.findMovementByReference.mockResolvedValue(existingMovement);

    await expect(
      inventoryService.applyMovement({
        ...baseInput(-3),
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        reference: { type: InventoryReferenceType.ORDER, id: "order-1" },
      })
    ).rejects.toMatchObject({
      name: "InventoryServiceError",
      code: "IDEMPOTENCY_CONFLICT",
    });

    expect(mocks.repository.findBalanceForUpdate).not.toHaveBeenCalled();
    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1);
  });

  it("falha com erro previsivel para item inexistente", async () => {
    mocks.repository.findInventoryItem.mockResolvedValue(null);

    await expect(inventoryService.applyMovement(baseInput(1))).rejects.toBeInstanceOf(
      InventoryServiceError
    );
    await expect(inventoryService.applyMovement(baseInput(1))).rejects.toMatchObject({
      code: "INVENTORY_ITEM_NOT_FOUND",
    });
  });
});

describe("inventoryService.applyMovement — validações de entidade", () => {
  it("falha com DISTRIBUTOR_NOT_FOUND quando distribuidora nao existe", async () => {
    mocks.repository.findDistributor.mockResolvedValue(null);

    await expect(inventoryService.applyMovement(baseInput(5), tx as never)).rejects.toMatchObject({
      name: "InventoryServiceError",
      code: "DISTRIBUTOR_NOT_FOUND",
    });

    expect(mocks.repository.findBalanceForUpdate).not.toHaveBeenCalled();
    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
  });

  it("falha com DISTRIBUTOR_INACTIVE quando distribuidora esta inativa", async () => {
    mocks.repository.findDistributor.mockResolvedValue(distributor({ is_active: false }));

    await expect(inventoryService.applyMovement(baseInput(5), tx as never)).rejects.toMatchObject({
      name: "InventoryServiceError",
      code: "DISTRIBUTOR_INACTIVE",
    });

    expect(mocks.repository.findBalanceForUpdate).not.toHaveBeenCalled();
    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
  });

  it("falha com INVENTORY_ITEM_INACTIVE quando item esta inativo", async () => {
    mocks.repository.findInventoryItem.mockResolvedValue(inventoryItem({ is_active: false }));

    await expect(inventoryService.applyMovement(baseInput(5), tx as never)).rejects.toMatchObject({
      name: "InventoryServiceError",
      code: "INVENTORY_ITEM_INACTIVE",
    });

    expect(mocks.repository.findBalanceForUpdate).not.toHaveBeenCalled();
    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
  });
});

describe("inventoryService.applyMovement — metadata e reference", () => {
  it("preserva metadata arbitraria no movimento criado e no resultado", async () => {
    const customMetadata = { origem: "importacao-csv", lote: "B-2026-05" };
    const expectedMovement = movement(10, { metadata: customMetadata });
    mocks.repository.createMovementOnce.mockResolvedValue(expectedMovement);
    mocks.repository.upsertBalance.mockResolvedValue(balance(20));

    const result = await inventoryService.applyMovement(
      { ...baseInput(10), metadata: customMetadata },
      tx as never
    );

    expect(mocks.repository.createMovementOnce).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: customMetadata }),
      tx
    );
    expect(result.movement.metadata).toEqual(customMetadata);
    expect(result.idempotentReplay).toBe(false);
  });

  it("preserva metadata vazia como objeto padrao quando nao informada", async () => {
    const { metadata: _ignored, ...inputWithoutMetadata } = baseInput(5);
    const expectedMovement = movement(5, { metadata: {} });
    mocks.repository.createMovementOnce.mockResolvedValue(expectedMovement);
    mocks.repository.upsertBalance.mockResolvedValue(balance(15));

    await inventoryService.applyMovement(inputWithoutMetadata, tx as never);

    expect(mocks.repository.createMovementOnce).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: undefined }),
      tx
    );
  });

  it("registra reference_type e reference_id corretos no movimento", async () => {
    const orderMovement = movement(-2, {
      movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
      reference_type: InventoryReferenceType.ORDER,
      reference_id: "order-abc",
    });
    mocks.repository.createMovementOnce.mockResolvedValue(orderMovement);
    mocks.repository.upsertBalance.mockResolvedValue(balance(8));

    const result = await inventoryService.applyMovement(
      {
        ...baseInput(-2),
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        reference: { type: InventoryReferenceType.ORDER, id: "order-abc" },
      },
      tx as never
    );

    expect(mocks.repository.createMovementOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        reference_type: InventoryReferenceType.ORDER,
        reference_id: "order-abc",
      }),
      tx
    );
    expect(result.movement.reference_type).toBe(InventoryReferenceType.ORDER);
    expect(result.movement.reference_id).toBe("order-abc");
  });

  it("chama createMovement (sem idempotencia) quando reference nao e informada", async () => {
    const { reference: _ignored, ...inputWithoutRef } = baseInput(7);
    const noRefMovement = movement(7, { reference_type: null, reference_id: null });
    mocks.repository.createMovement.mockResolvedValue(noRefMovement);
    mocks.repository.upsertBalance.mockResolvedValue(balance(17));

    const result = await inventoryService.applyMovement(inputWithoutRef, tx as never);

    expect(mocks.repository.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ reference_type: null, reference_id: null }),
      tx
    );
    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(result.idempotentReplay).toBe(false);
  });
});

describe("inventoryService.applyMovement — atomicidade transacional", () => {
  it("nao aplica upsertBalance se a criacao do movimento lancar erro", async () => {
    const dbError = new Error("db: unique constraint on movement_id");
    mocks.repository.createMovementOnce.mockRejectedValue(dbError);

    await expect(inventoryService.applyMovement(baseInput(5), tx as never)).rejects.toThrow(
      dbError
    );

    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
  });

  it("nao aplica upsertBalance se a saida falhar na validacao de saldo", async () => {
    mocks.repository.findBalanceForUpdate.mockResolvedValue(balance(1));

    await expect(
      inventoryService.applyMovement(
        {
          ...baseInput(-5),
          movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
          reference: { type: InventoryReferenceType.ORDER, id: "order-2" },
        },
        tx as never
      )
    ).rejects.toMatchObject({ code: "STOCK_UNAVAILABLE" });

    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
  });

  it("nao aplica upsertBalance se a saida falhar com saldo inexistente", async () => {
    mocks.repository.findBalanceForUpdate.mockResolvedValue(null);

    await expect(
      inventoryService.applyMovement(
        {
          ...baseInput(-1),
          movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
          reference: { type: InventoryReferenceType.ORDER, id: "order-3" },
        },
        tx as never
      )
    ).rejects.toMatchObject({ code: "STOCK_UNAVAILABLE" });

    expect(mocks.repository.createMovementOnce).not.toHaveBeenCalled();
    expect(mocks.repository.upsertBalance).not.toHaveBeenCalled();
  });

  it("abre transacao propria quando tx nao e fornecido", async () => {
    mocks.repository.findBalanceForUpdate.mockResolvedValue(null);
    mocks.repository.upsertBalance.mockResolvedValue(balance(10));

    await inventoryService.applyMovement(baseInput(10));

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("reutiliza tx externa sem abrir nova transacao", async () => {
    mocks.repository.findBalanceForUpdate.mockResolvedValue(null);
    mocks.repository.upsertBalance.mockResolvedValue(balance(10));

    await inventoryService.applyMovement(baseInput(10), tx as never);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
