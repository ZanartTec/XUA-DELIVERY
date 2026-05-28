import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  prisma: {
    distributorInventoryBalance: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    inventoryMovement: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

const { inventoryRepository } = await import("./inventory.repository.js");

const distributorA = "7e1d7b55-3f52-4d10-aac3-74387c236201";
const distributorB = "7e1d7b55-3f52-4d10-aac3-74387c236202";
const itemA = "7e1d7b55-3f52-4d10-aac3-74387c236203";
const itemB = "7e1d7b55-3f52-4d10-aac3-74387c236204";
const firstDate = new Date("2026-05-26T12:00:00.000Z");
const secondDate = new Date("2026-05-27T12:00:00.000Z");

const inventoryItemA = {
  id: itemA,
  code: "WATER20L",
  name: "Agua 20L",
  type: "SELLABLE_PRODUCT",
  unit_label: "un",
  low_stock_threshold: 5,
};

const inventoryItemB = {
  id: itemB,
  code: "EMPTY20L",
  name: "Garrafao vazio 20L",
  type: "RETURNABLE_EMPTY",
  unit_label: "un",
  low_stock_threshold: 2,
};

const balances = [
  {
    id: "balance-a-1",
    distributor_id: distributorA,
    inventory_item_id: itemA,
    quantity_on_hand: 4,
    last_movement_at: firstDate,
    updated_at: firstDate,
    inventory_item: inventoryItemA,
  },
  {
    id: "balance-a-2",
    distributor_id: distributorA,
    inventory_item_id: itemB,
    quantity_on_hand: 12,
    last_movement_at: secondDate,
    updated_at: secondDate,
    inventory_item: inventoryItemB,
  },
  {
    id: "balance-b-1",
    distributor_id: distributorB,
    inventory_item_id: itemA,
    quantity_on_hand: 99,
    last_movement_at: firstDate,
    updated_at: firstDate,
    inventory_item: inventoryItemA,
  },
];

const movements = [
  {
    id: "movement-a-1",
    distributor_id: distributorA,
    inventory_item_id: itemA,
    quantity_delta: 4,
    movement_type: InventoryMovementType.INITIAL_LOAD,
    actor_type: ActorType.DISTRIBUTOR_USER,
    actor_id: "user-a",
    source_app: SourceApp.DISTRIBUTOR_WEB,
    reference_type: InventoryReferenceType.INITIAL_LOAD,
    reference_id: "batch-a",
    metadata: { batch: "a" },
    occurred_at: firstDate,
    inventory_item: inventoryItemA,
  },
  {
    id: "movement-a-2",
    distributor_id: distributorA,
    inventory_item_id: itemB,
    quantity_delta: 12,
    movement_type: InventoryMovementType.PURCHASE_IN,
    actor_type: ActorType.DISTRIBUTOR_USER,
    actor_id: "user-a",
    source_app: SourceApp.DISTRIBUTOR_WEB,
    reference_type: InventoryReferenceType.PURCHASE,
    reference_id: "purchase-a",
    metadata: { purchase: "a" },
    occurred_at: secondDate,
    inventory_item: inventoryItemB,
  },
  {
    id: "movement-b-1",
    distributor_id: distributorB,
    inventory_item_id: itemA,
    quantity_delta: 99,
    movement_type: InventoryMovementType.INITIAL_LOAD,
    actor_type: ActorType.DISTRIBUTOR_USER,
    actor_id: "user-b",
    source_app: SourceApp.DISTRIBUTOR_WEB,
    reference_type: InventoryReferenceType.INITIAL_LOAD,
    reference_id: "batch-b",
    metadata: { batch: "b" },
    occurred_at: firstDate,
    inventory_item: inventoryItemA,
  },
];

function filterBalances(where: { distributor_id?: string; inventory_item_id?: string }) {
  return balances.filter(
    (balance) =>
      (!where.distributor_id || balance.distributor_id === where.distributor_id) &&
      (!where.inventory_item_id || balance.inventory_item_id === where.inventory_item_id)
  );
}

function filterMovements(where: {
  distributor_id?: string;
  inventory_item_id?: string;
  movement_type?: InventoryMovementType;
  occurred_at?: { gte?: Date; lte?: Date };
}) {
  return movements.filter(
    (movement) =>
      (!where.distributor_id || movement.distributor_id === where.distributor_id) &&
      (!where.inventory_item_id || movement.inventory_item_id === where.inventory_item_id) &&
      (!where.movement_type || movement.movement_type === where.movement_type) &&
      (!where.occurred_at?.gte || movement.occurred_at >= where.occurred_at.gte) &&
      (!where.occurred_at?.lte || movement.occurred_at <= where.occurred_at.lte)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.distributorInventoryBalance.findMany.mockImplementation(({ where, skip, take }) => {
    const start = skip ?? 0;
    const end = take == null ? undefined : start + take;
    return filterBalances(where).slice(start, end);
  });
  mocks.prisma.distributorInventoryBalance.count.mockImplementation(({ where }) =>
    filterBalances(where).length
  );
  mocks.prisma.inventoryMovement.findMany.mockImplementation(({ where, skip, take }) =>
    filterMovements(where).slice(skip, skip + take)
  );
  mocks.prisma.inventoryMovement.count.mockImplementation(({ where }) =>
    filterMovements(where).length
  );
});

describe("inventoryRepository leitura distribuidor", () => {
  it("lista apenas saldos da distribuidora solicitada com dois itens", async () => {
    const result = await inventoryRepository.listBalances({
      distributorId: distributorA,
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.balances.map((balance) => balance.id)).toEqual(["balance-a-1", "balance-a-2"]);
    expect(mocks.prisma.distributorInventoryBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { distributor_id: distributorA },
        select: expect.not.objectContaining({ distributor_id: true }),
      })
    );
  });

  it("filtra saldos por item sem vazar outra distribuidora", async () => {
    const result = await inventoryRepository.listBalances({
      distributorId: distributorA,
      inventoryItemId: itemA,
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.balances[0]?.id).toBe("balance-a-1");
  });

  it("filtra stock_status apos consulta ORM mantendo escopo da distribuidora", async () => {
    const lowStock = await inventoryRepository.listBalances({
      distributorId: distributorA,
      stockStatus: "LOW_STOCK",
      limit: 50,
      offset: 0,
    });
    const okStock = await inventoryRepository.listBalances({
      distributorId: distributorA,
      stockStatus: "OK",
      limit: 50,
      offset: 0,
    });

    expect(lowStock.total).toBe(1);
    expect(lowStock.balances.map((balance) => balance.id)).toEqual(["balance-a-1"]);
    expect(okStock.total).toBe(1);
    expect(okStock.balances.map((balance) => balance.id)).toEqual(["balance-a-2"]);
    expect(mocks.prisma.distributorInventoryBalance.count).not.toHaveBeenCalled();
    expect(mocks.prisma.distributorInventoryBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { distributor_id: distributorA } })
    );
  });

  it("lista apenas movimentos da distribuidora solicitada e aplica filtros", async () => {
    const result = await inventoryRepository.listMovements({
      distributorId: distributorA,
      inventoryItemId: itemA,
      movementType: InventoryMovementType.INITIAL_LOAD,
      start: new Date("2026-05-26T00:00:00.000Z"),
      end: new Date("2026-05-26T23:59:59.999Z"),
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.movements[0]?.id).toBe("movement-a-1");
    expect(mocks.prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          distributor_id: distributorA,
          inventory_item_id: itemA,
          movement_type: InventoryMovementType.INITIAL_LOAD,
          occurred_at: {
            gte: new Date("2026-05-26T00:00:00.000Z"),
            lte: new Date("2026-05-26T23:59:59.999Z"),
          },
        },
        select: expect.not.objectContaining({ distributor_id: true }),
      })
    );
  });
});