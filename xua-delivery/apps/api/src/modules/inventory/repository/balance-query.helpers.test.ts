import { describe, expect, it } from "vitest";
import { InventoryItemType } from "@xua/shared/enums";
import { balanceItemWhere, matchesStockStatus } from "./balance-query.helpers.js";

describe("balanceItemWhere", () => {
  it("retorna undefined quando nao ha filtros de item", () => {
    expect(balanceItemWhere({})).toBeUndefined();
  });

  it("monta busca por codigo/nome e tipo do item", () => {
    expect(
      balanceItemWhere({ search: "agua", itemType: InventoryItemType.SELLABLE_PRODUCT })
    ).toEqual({
      OR: [
        { code: { contains: "agua", mode: "insensitive" } },
        { name: { contains: "agua", mode: "insensitive" } },
      ],
      type: InventoryItemType.SELLABLE_PRODUCT,
    });
  });

  it("inclui is_active no where do banco quando isActive esta definido", () => {
    expect(balanceItemWhere({ isActive: true })).toEqual({ is_active: true });
    expect(balanceItemWhere({ isActive: false })).toEqual({ is_active: false });
  });

  it("omite is_active quando isActive nao e informado", () => {
    expect(balanceItemWhere({ search: "agua" })).not.toHaveProperty("is_active");
  });
});

describe("matchesStockStatus", () => {
  const row = (quantity: number, threshold: number | null) => ({
    quantity_on_hand: quantity,
    inventory_item: { low_stock_threshold: threshold },
  });

  it("classifica LOW_STOCK quando quantidade esta no limite ou abaixo", () => {
    expect(matchesStockStatus(row(5, 5), "LOW_STOCK")).toBe(true);
    expect(matchesStockStatus(row(6, 5), "LOW_STOCK")).toBe(false);
  });

  it("classifica OK quando acima do limite ou sem limite definido", () => {
    expect(matchesStockStatus(row(6, 5), "OK")).toBe(true);
    expect(matchesStockStatus(row(0, null), "OK")).toBe(true);
    expect(matchesStockStatus(row(0, null), "LOW_STOCK")).toBe(false);
  });
});
