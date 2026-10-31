import type { Response } from "express";
import type { ReceiptFormat } from "@xua/shared/schemas/order";
import { getPrimaryAppOrigin } from "../../../http/allowed-origins.js";
import { renderReceiptsPdf, type RenderableReceipt } from "./render-receipt.js";

/**
 * Escreve o PDF direto na resposta. `no-store` porque o documento tem CPF e
 * endereço do cliente; `inline` para abrir no visualizador e imprimir.
 */
export async function sendReceiptsPdf(
  res: Response,
  receipts: RenderableReceipt[],
  format: ReceiptFormat,
  filename: string
): Promise<void> {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");

  const appOrigin = getPrimaryAppOrigin().replace(/\/$/, "");
  // QR aponta para a tela autenticada do pedido — nunca para o PDF.
  await renderReceiptsPdf(receipts, format, res, (orderId) => `${appOrigin}/orders/${orderId}`);
}
