import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  InventoryMovementType,
  InventoryReferenceType,
  SourceApp,
} from "@xua/shared/enums";
import {
  opsInventoryBalanceQuerySchema,
  opsInventoryMovementQuerySchema,
  opsInventoryReconciliationQuerySchema,
} from "@xua/shared/schemas/inventory";

const mocks = vi.hoisted(() => ({
  repository: {
    listBalances: vi.fn(),
    findBalanceById: vi.fn(),
    listMovements: vi.fn(),
    findMovementById: vi.fn(),
    listReconciliations: vi.fn(),
    findReconciliationById: vi.fn(),
  },
}));

vi.mock("../repository/inventory-read.repository.js", () => ({
  opsInventoryReadRepository: mocks.repository,
}));

const { opsInventoryReadService } = await import("./inventory-read.service.js");

const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236301";
const inventoryItemId = "7e1d7b55-3f52-4d10-aac3-74387c236302";
const balanceId = "7e1d7b55-3f52-4d10-aac3-74387c236303";
const movementId = "7e1d7b55-3f52-4d10-aac3-74387c236304";
const reconciliationId = "7e1d7b55-3f52-4d10-aac3-74387c236305";
const occurredAt = new Date("2026-05-26T10:30:00.000Z");
const updatedAt = new Date("2026-05-26T11:00:00.000Z");

function distributor() {
  return { id: distributorId, name: "XUA Centro" };
}

function inventoryItem() {
  return {
    id: inventoryItemId,
    code: "WATER20L",
    name: "Agua 20L",
    type: "SELLABLE_PRODUCT",
    unit_label: "un",
    low_stock_threshold: 5,
  };
}

function balanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: balanceId,
    distributor_id: distributorId,
    inventory_item_id: inventoryItemId,
    quantity_on_hand: 4,
    last_movement_at: occurredAt,
    updated_at: updatedAt,
    distributor: distributor(),
    inventory_item: inventoryItem(),
    ...overrides,
  };
}

function movementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: movementId,
    distributor_id: distributorId,
    inventory_item_id: inventoryItemId,
    quantity_delta: -2,
    movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
    actor_type: ActorType.OPS,
    actor_id: "ops-user-1",
    source_app: SourceApp.OPS_CONSOLE,
    reference_type: InventoryReferenceType.ORDER,
    reference_id: "order-1",
    metadata: {
      origin: "distributor_initial_load_endpoint",
      batch_id: "7e1d7b55-3f52-4d10-aac3-74387c236399",
      batch_hash: "safe-hash",
      batch_version: "v1",
      observation: "Nao deve aparecer no OPS",
      consumer_phone: "+244999000111",
    },
    occurred_at: occurredAt,
    distributor: distributor(),
    inventory_item: inventoryItem(),
    ...overrides,
  };
}

function reconciliationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: reconciliationId,
    distributor_id: distributorId,
    reconciliation_date: new Date("2026-05-26T00:00:00.000Z"),
    full_out: 12,
    empty_returned: 10,
    delta: 2,
    justification: "Divergencia validada pela operacao",
    closed_by: "distributor-admin-1",
    created_at: occurredAt,
    distributor: distributor(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.listBalances.mockResolvedValue({ balances: [balanceRow()], total: 1 });
  mocks.repository.findBalanceById.mockResolvedValue(balanceRow());
  mocks.repository.listMovements.mockResolvedValue({ movements: [movementRow()], total: 1 });
  mocks.repository.findMovementById.mockResolvedValue(movementRow());
  mocks.repository.listReconciliations.mockResolvedValue({
    reconciliations: [reconciliationRow()],
    total: 1,
  });
  mocks.repository.findReconciliationById.mockResolvedValue(reconciliationRow());
});

describe("opsInventoryReadService.listBalances", () => {
  it("lista saldos globais com filtros, paginacao obrigatoria e distribuidora", async () => {
    const query = opsInventoryBalanceQuerySchema.parse({
      distributor_id: distributorId,
      inventory_item_id: inventoryItemId,
      limit: "20",
      offset: "5",
    });

    const result = await opsInventoryReadService.listBalances(query);

    expect(mocks.repository.listBalances).toHaveBeenCalledWith({
      distributorId,
      inventoryItemId,
      limit: 20,
      offset: 5,
    });
    expect(result).toEqual({
      balances: [
        {
          id: balanceId,
          distributor_id: distributorId,
          distributor_name: "XUA Centro",
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
          updated_at: updatedAt,
        },
      ],
      pagination: { limit: 20, offset: 5, total: 1 },
    });
  });

  it("exige limit e offset nos schemas OPS", () => {
    expect(opsInventoryBalanceQuerySchema.safeParse({ limit: "20" }).success).toBe(false);
    expect(opsInventoryBalanceQuerySchema.safeParse({ offset: "0" }).success).toBe(false);
  });
});

describe("opsInventoryReadService.listMovements", () => {
  it("lista movimentos com filtros por distribuidora, item, tipo e periodo", async () => {
    const query = opsInventoryMovementQuerySchema.parse({
      distributor_id: distributorId,
      inventory_item_id: inventoryItemId,
      movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
      start: "2026-05-26",
      end: "2026-05-26",
      limit: "10",
      offset: "0",
    });

    const result = await opsInventoryReadService.listMovements(query);

    expect(mocks.repository.listMovements).toHaveBeenCalledWith({
      distributorId,
      inventoryItemId,
      movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
      start: new Date("2026-05-26T00:00:00.000Z"),
      end: new Date("2026-05-26T23:59:59.999Z"),
      limit: 10,
      offset: 0,
    });
    expect(result.movements[0]).toMatchObject({
      id: movementId,
      distributor_id: distributorId,
      distributor_name: "XUA Centro",
      inventory_item_id: inventoryItemId,
      movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
      reference_type: InventoryReferenceType.ORDER,
      metadata: {
        origin: "distributor_initial_load_endpoint",
        batch_id: "7e1d7b55-3f52-4d10-aac3-74387c236399",
        batch_hash: "safe-hash",
        batch_version: "v1",
      },
    });
    expect(result.pagination).toEqual({ limit: 10, offset: 0, total: 1 });
  });

  it("rejeita periodo invertido no schema OPS", () => {
    const parsed = opsInventoryMovementQuerySchema.safeParse({
      start: "2026-05-27",
      end: "2026-05-26",
      limit: "10",
      offset: "0",
    });

    expect(parsed.success).toBe(false);
  });

  it("exige periodo limitado para consulta global de movimentos", () => {
    expect(
      opsInventoryMovementQuerySchema.safeParse({
        limit: "10",
        offset: "0",
      }).success
    ).toBe(false);

    expect(
      opsInventoryMovementQuerySchema.safeParse({
        start: "2026-01-01",
        end: "2026-03-01",
        limit: "10",
        offset: "0",
      }).success
    ).toBe(false);
  });
});

describe("opsInventoryReadService.reconciliations", () => {
  it("lista reconciliacoes read-only com filtro por distribuidora e periodo", async () => {
    const query = opsInventoryReconciliationQuerySchema.parse({
      distributor_id: distributorId,
      start: "2026-05-26",
      end: "2026-05-26",
      limit: "10",
      offset: "0",
    });

    const result = await opsInventoryReadService.listReconciliations(query);

    expect(mocks.repository.listReconciliations).toHaveBeenCalledWith({
      distributorId,
      start: new Date("2026-05-26T00:00:00.000Z"),
      end: new Date("2026-05-26T23:59:59.999Z"),
      limit: 10,
      offset: 0,
    });
    expect(result).toEqual({
      reconciliations: [
        {
          id: reconciliationId,
          distributor_id: distributorId,
          distributor_name: "XUA Centro",
          reconciliation_date: new Date("2026-05-26T00:00:00.000Z"),
          full_out: 12,
          empty_returned: 10,
          delta: 2,
          justification: "Divergencia validada pela operacao",
          closed_by: "distributor-admin-1",
          created_at: occurredAt,
        },
      ],
      pagination: { limit: 10, offset: 0, total: 1 },
    });
  });

  it("retorna detalhe por id quando aplicavel", async () => {
    await expect(opsInventoryReadService.getReconciliation(reconciliationId)).resolves.toEqual({
      reconciliation: {
        id: reconciliationId,
        distributor_id: distributorId,
        distributor_name: "XUA Centro",
        reconciliation_date: new Date("2026-05-26T00:00:00.000Z"),
        full_out: 12,
        empty_returned: 10,
        delta: 2,
        justification: "Divergencia validada pela operacao",
        closed_by: "distributor-admin-1",
        created_at: occurredAt,
      },
    });

    expect(mocks.repository.findReconciliationById).toHaveBeenCalledWith(reconciliationId);
  });

  it("exige periodo limitado para consulta global de reconciliacoes", () => {
    expect(
      opsInventoryReconciliationQuerySchema.safeParse({
        limit: "10",
        offset: "0",
      }).success
    ).toBe(false);

    expect(
      opsInventoryReconciliationQuerySchema.safeParse({
        start: "2026-01-01",
        end: "2026-03-01",
        limit: "10",
        offset: "0",
      }).success
    ).toBe(false);
  });
});