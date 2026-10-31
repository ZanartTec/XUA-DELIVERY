import type { ReceiptFormat } from "@xua/shared/schemas/order";

export type { ReceiptFormat };

export const RECEIPT_FORMAT_LABELS: Record<ReceiptFormat, string> = {
  a4: "A4",
  thermal: "Térmica 80mm",
};

const FORMAT_STORAGE_KEY = "xua:receipt-format";

/** Preferência por navegador: a impressora fica no mesmo computador/celular. */
export function readReceiptFormat(fallback: ReceiptFormat = "a4"): ReceiptFormat {
  try {
    const stored = window.localStorage.getItem(FORMAT_STORAGE_KEY);
    return stored === "a4" || stored === "thermal" ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function saveReceiptFormat(format: ReceiptFormat) {
  try {
    window.localStorage.setItem(FORMAT_STORAGE_KEY, format);
  } catch {
    // Storage indisponível (aba anônima, bloqueio): segue sem lembrar.
  }
}

export function formatReceiptNumber(number: number) {
  return String(number).padStart(6, "0");
}

export function orderReceiptUrl(orderId: string, format: ReceiptFormat) {
  return `/api/orders/${orderId}/receipt.pdf?format=${format}`;
}

export function routeReceiptsUrl(routeId: string, format: ReceiptFormat) {
  return `/api/distributor/routes/${routeId}/receipts.pdf?format=${format}`;
}

/**
 * Abre o PDF numa aba nova. `/api/*` passa pelo proxy do Next (mesma origem),
 * então o cookie de sessão vai junto sem precisar baixar como blob.
 */
export function openReceipt(url: string) {
  window.open(url, "_blank", "noopener");
}
