import { describe, expect, it } from "vitest";
import { InventoryItemType, InventoryMovementType } from "@xua/shared/enums";
import {
  inventoryBalanceQuerySchema,
  inventoryInitialLoadSchema,
  inventoryItemCreateSchema,
  inventoryItemUpdateSchema,
  inventoryReconciliationSessionCloseSchema,
  inventoryReconciliationSessionOpenSchema,
  opsInventoryMovementQuerySchema,
} from "@xua/shared/schemas/inventory";

const itemA = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const itemB = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const batchId = "7e1d7b55-3f52-4d10-aac3-74387c236903";

describe("inventory shared schemas", () => {
  it("valida filtros de saldo com busca, tipo, alerta e paginacao", () => {
    const parsed = inventoryBalanceQuerySchema.parse({
      q: "agua",
      item_type: InventoryItemType.SELLABLE_PRODUCT,
      stock_status: "LOW_STOCK",
      limit: "20",
      offset: "0",
    });

    expect(parsed).toEqual({
      q: "agua",
      item_type: InventoryItemType.SELLABLE_PRODUCT,
      stock_status: "LOW_STOCK",
      is_active: true,
      limit: 20,
      offset: 0,
    });
    expect(
      inventoryBalanceQuerySchema.safeParse({ stock_status: "CRITICAL", limit: "20", offset: "0" })
        .success
    ).toBe(false);
  });

  it("assume is_active=true por padrao e aceita is_active=false nos filtros de saldo", () => {
    expect(inventoryBalanceQuerySchema.parse({}).is_active).toBe(true);
    expect(
      inventoryBalanceQuerySchema.parse({ is_active: "false", limit: "20", offset: "0" }).is_active
    ).toBe(false);
    expect(
      inventoryBalanceQuerySchema.safeParse({ is_active: "maybe", limit: "20", offset: "0" })
        .success
    ).toBe(false);
  });

  it("valida filtros de movimento OPS com periodo global previsivel", () => {
    expect(
      opsInventoryMovementQuerySchema.safeParse({
        movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
        start: "2026-05-01",
        end: "2026-05-31",
        limit: "50",
        offset: "0",
      }).success
    ).toBe(true);

    expect(
      opsInventoryMovementQuerySchema.safeParse({
        start: "2026-05-31",
        end: "2026-05-01",
        limit: "50",
        offset: "0",
      }).success
    ).toBe(false);
  });

  it("valida criacao e edicao de item de estoque", () => {
    const created = inventoryItemCreateSchema.parse({
      code: "water20l",
      name: "Agua 20L",
      type: InventoryItemType.SELLABLE_PRODUCT,
      unit_label: "un",
      low_stock_threshold: 5,
    });

    expect(created.code).toBe("WATER20L");
    expect(inventoryItemCreateSchema.safeParse({ ...created, code: "agua 20" }).success).toBe(false);
    expect(inventoryItemUpdateSchema.safeParse({}).success).toBe(false);
    expect(inventoryItemUpdateSchema.safeParse({ low_stock_threshold: -1 }).success).toBe(false);
    expect(inventoryItemUpdateSchema.safeParse({ is_active: false }).success).toBe(true);
  });

  it("valida carga inicial com itens unicos e quantidades inteiras", () => {
    expect(
      inventoryInitialLoadSchema.safeParse({
        batch_id: batchId,
        items: [
          { inventory_item_id: itemA, quantity: 10 },
          { inventory_item_id: itemB, quantity: 0 },
        ],
      }).success
    ).toBe(true);

    expect(
      inventoryInitialLoadSchema.safeParse({
        batch_id: batchId,
        items: [{ inventory_item_id: itemA, quantity: -1 }],
      }).success
    ).toBe(false);

    expect(
      inventoryInitialLoadSchema.safeParse({
        batch_id: batchId,
        items: [
          { inventory_item_id: itemA, quantity: 1 },
          { inventory_item_id: itemA, quantity: 2 },
        ],
      }).success
    ).toBe(false);
  });

  it("valida abertura e fechamento de sessao de conciliacao", () => {
    expect(inventoryReconciliationSessionOpenSchema.safeParse({}).success).toBe(true);
    expect(inventoryReconciliationSessionOpenSchema.safeParse({ distributor_id: "global" }).success).toBe(false);

    expect(
      inventoryReconciliationSessionCloseSchema.safeParse({
        counts: [
          { inventory_item_id: itemA, counted_quantity: 8 },
          { inventory_item_id: itemB, counted_quantity: 3 },
        ],
      }).success
    ).toBe(true);

    expect(
      inventoryReconciliationSessionCloseSchema.safeParse({
        counts: [{ inventory_item_id: itemA, counted_quantity: 1.5 }],
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
