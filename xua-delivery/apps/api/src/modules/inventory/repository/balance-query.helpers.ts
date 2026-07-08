import type { Prisma } from "@prisma/client";
import type { InventoryItemType } from "@xua/shared/enums";
import type { InventoryStockStatusFilterInput } from "@xua/shared/schemas/inventory";

export type BalanceItemWhereParams = {
  search?: string;
  itemType?: InventoryItemType;
  isActive?: boolean;
};

/**
 * Where do item de estoque aplicado ao join de saldos. O filtro de is_active
 * entra aqui para ser resolvido no banco, antes de qualquer pós-filtro em
 * memória (caminho stockStatus dos repositórios).
 */
export function balanceItemWhere(
  params: BalanceItemWhereParams
): Prisma.InventoryItemWhereInput | undefined {
  const where: Prisma.InventoryItemWhereInput = {
    ...(params.search
      ? {
          OR: [
            { code: { contains: params.search, mode: "insensitive" } },
            { name: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.itemType ? { type: params.itemType } : {}),
    ...(params.isActive === undefined ? {} : { is_active: params.isActive }),
  };

  return Object.keys(where).length > 0 ? where : undefined;
}

export type BalanceStockStatusRow = {
  quantity_on_hand: number;
  inventory_item: { low_stock_threshold: number | null };
};

export function matchesStockStatus(
  balance: BalanceStockStatusRow,
  stockStatus: InventoryStockStatusFilterInput
): boolean {
  const threshold = balance.inventory_item.low_stock_threshold;
  const isLowStock = threshold !== null && balance.quantity_on_hand <= threshold;
  return stockStatus === "LOW_STOCK" ? isLowStock : !isLowStock;
}
