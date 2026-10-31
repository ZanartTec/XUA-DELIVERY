import { PaymentStatus } from "@xua/shared/enums";
import type { ReceiptAddress } from "./receipt-snapshot.js";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56 — com espaço comum (a fonte padrão do PDF não precisa do NBSP do Intl). */
export function formatCents(cents: number): string {
  return BRL.format(cents / 100).replace(/ /g, " ");
}

export function formatReceiptNumber(number: number): string {
  return String(number).padStart(6, "0");
}

/** CPF (11) ou CNPJ (14) formatado; outros tamanhos saem como vieram. */
export function formatDocument(document: string | null | undefined): string | null {
  if (!document) return null;
  const digits = document.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return document;
}

export function formatZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = zip.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : zip;
}

/** "Rua X, 123 - Apto 4 - Centro - São Paulo/SP - CEP 01000-000"; null se não houver nada. */
export function formatAddressLine(address: ReceiptAddress): string | null {
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const cityLine = [address.city, address.state].filter(Boolean).join("/");
  const zip = formatZip(address.zip_code);
  const parts = [
    streetLine,
    address.complement,
    address.neighborhood,
    cityLine,
    zip ? `CEP ${zip}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" - ") : null;
}

/** `delivery_date` é coluna DATE (meia-noite UTC): formata em UTC para não voltar um dia. */
export function formatDateOnly(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(iso));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDeliveryWindow(window: string): string {
  if (window === "MORNING") return "Manhã";
  if (window === "AFTERNOON") return "Tarde";
  return window;
}

const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit: "CARTÃO DE CRÉDITO",
  cash: "DINHEIRO",
  card_on_delivery: "CARTÃO",
};

/**
 * Linha de pagamento do comprovante. Recebe o método congelado no snapshot e
 * o status ATUAL do pagamento (ver receipt-snapshot.ts):
 * - pago (CAPTURED)            → "PAGO – PIX" / "PAGO – CARTÃO DE CRÉDITO" / "PAGO – DINHEIRO"
 * - estornado                  → "ESTORNADO – PIX"
 * - dinheiro a receber         → "A RECEBER – DINHEIRO (troco p/ R$ 100,00)"
 * - cartão na entrega a receber→ "A RECEBER – CARTÃO NA ENTREGA"
 * - online ainda não capturado → "AGUARDANDO PAGAMENTO – PIX"
 */
export function formatPaymentLine(
  method: string | null,
  status: string | null,
  cashChangeForCents: number | null
): string {
  // Status vem antes do método: pagamentos antigos têm `payment_method` nulo
  // e mesmo assim podem estar capturados.
  const label = method ? (METHOD_LABELS[method] ?? method.toUpperCase()) : null;
  if (status === PaymentStatus.CAPTURED) return label ? `PAGO – ${label}` : "PAGO";
  if (status === PaymentStatus.REFUNDED) return label ? `ESTORNADO – ${label}` : "ESTORNADO";
  if (!method) return "A RECEBER";

  if (method === "cash") {
    return cashChangeForCents && cashChangeForCents > 0
      ? `A RECEBER – DINHEIRO (troco p/ ${formatCents(cashChangeForCents)})`
      : "A RECEBER – DINHEIRO";
  }
  if (method === "card_on_delivery") return "A RECEBER – CARTÃO NA ENTREGA";
  return `AGUARDANDO PAGAMENTO – ${label}`;
}
