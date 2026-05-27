import type { InventoryItemType } from "@xua/shared/enums";

export type StockStatusFilter = "ALL" | "LOW_STOCK" | "OK";
export type ItemTypeFilter = "ALL" | InventoryItemType;
export type ReconciliationStatusFilter = "ALL" | "OPEN" | "CLOSED";

export const INVENTORY_ITEM_TYPE_LABEL: Record<InventoryItemType, string> = {
  SELLABLE_PRODUCT: "Produto",
  RETURNABLE_FULL: "Retornável cheio",
  RETURNABLE_EMPTY: "Retornável vazio",
  SUPPLY: "Insumo",
};

export const INVENTORY_MOVEMENT_LABEL: Record<string, string> = {
  INITIAL_LOAD: "Carga inicial",
  ORDER_ACCEPT_OUT: "Saída por pedido",
  ORDER_CANCEL_RETURN: "Retorno por cancelamento",
  DELIVERY_FAILED_RETURN: "Retorno por falha",
  EMPTY_RETURN_IN: "Vazio recebido",
  RECONCILIATION_ADJUSTMENT: "Ajuste de conciliação",
  MANUAL_CORRECTION: "Correção manual",
  LOSS_WRITE_OFF: "Baixa por perda",
  PURCHASE_IN: "Compra",
};

export function buildInventoryQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

export function formatInventoryQuantity(value: number, unit: string) {
  return `${value.toLocaleString("pt-BR")} ${unit}`;
}
