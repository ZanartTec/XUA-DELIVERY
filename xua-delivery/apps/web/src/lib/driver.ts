import { formatCurrency } from "@/src/lib/utils";
import { isCashPaymentMethod, isOfflinePaymentMethod } from "@xua/shared/mappers/payment";

/** Abre o endereço no app de mapas do celular (Google Maps resolve para Waze/Apple Maps no sistema). */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export interface DoorCharge {
  /** Há algo a receber na porta? */
  due: boolean;
  /** "Cobrar R$ 50,00 em dinheiro" / "Pago no app". */
  label: string;
  /** "Troco para R$ 100,00" / "Valor exato" (só dinheiro). */
  detail: string | null;
  method: "cash" | "card" | "online";
}

/** O que o motorista recebe na porta, a partir do pagamento do pedido. */
export function describeDoorCharge(input: {
  total_cents: number;
  payment_method?: string | null;
  payment_status?: string | null;
  cash_change_for_cents?: number | null;
}): DoorCharge {
  if (!isOfflinePaymentMethod(input.payment_method)) {
    return { due: false, label: "Pago no app", detail: null, method: "online" };
  }
  const cash = isCashPaymentMethod(input.payment_method);
  const received = input.payment_status === "CAPTURED";
  return {
    due: !received,
    label: received
      ? cash
        ? "Dinheiro recebido"
        : "Cartão recebido"
      : `Cobrar ${formatCurrency(input.total_cents)} ${cash ? "em dinheiro" : "no cartão"}`,
    detail:
      cash && !received
        ? input.cash_change_for_cents == null
          ? "Valor exato"
          : `Troco para ${formatCurrency(input.cash_change_for_cents)}`
        : null,
    method: cash ? "cash" : "card",
  };
}

export function windowLabel(window: string) {
  return window === "MORNING" ? "Manhã" : "Tarde";
}
