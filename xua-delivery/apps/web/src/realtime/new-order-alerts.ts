import type { NewOrderPayload, OrderStatusChangedPayload } from "@xua/shared/realtime/events";

/** O que fazer quando chega um `new_order`. */
export interface NewOrderAlertDecision {
  /** Mostrar o toast "Novo pedido". */
  toast: boolean;
  /** Tocar som (e vibrar no celular). */
  sound: boolean;
  /** Pedidos novos não vistos com a aba oculta (vai para o título). */
  unseen: number;
}

/**
 * Regras do alerta de pedido novo da distribuidora (T4.1–T4.3), sem DOM.
 *
 * - Deduplica por `orderId`: o mesmo pedido pode chegar de novo (reenvio do
 *   worker, resync, push) e não pode alertar duas vezes. Guarda no máximo
 *   `cap` ids, descartando os mais antigos.
 * - Pedido de assinatura (D6) não alerta: só atualiza a fila e o badge.
 * - Com a aba oculta, conta os não vistos para o título; zera ao voltar.
 */
export function createNewOrderAlerts(cap = 200) {
  const seen = new Set<string>();
  let unseen = 0;

  function remember(orderId: string): boolean {
    if (seen.has(orderId)) return false;
    seen.add(orderId);
    if (seen.size > cap) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    return true;
  }

  return {
    onNewOrder(
      payload: Pick<NewOrderPayload, "orderId" | "origin">,
      ctx: { hidden: boolean; soundEnabled: boolean }
    ): NewOrderAlertDecision {
      const silent: NewOrderAlertDecision = { toast: false, sound: false, unseen };
      if (!payload.orderId || !remember(payload.orderId)) return silent;
      if (payload.origin === "assinatura") return silent;

      if (ctx.hidden) unseen += 1;
      return { toast: true, sound: ctx.soundEnabled, unseen };
    },

    /** Aba voltou a ficar visível. */
    markSeen(): void {
      unseen = 0;
    },

    get unseen(): number {
      return unseen;
    },
  };
}

const UNSEEN_PREFIX = /^\(\d+\)\s+/;

/** `(3) Pedidos · Xuá` com pendências; título original sem elas. */
export function formatTabTitle(baseTitle: string, unseen: number): string {
  const clean = baseTitle.replace(UNSEEN_PREFIX, "");
  return unseen > 0 ? `(${unseen > 99 ? "99+" : unseen}) ${clean}` : clean;
}

/**
 * Cancelamento que merece toast (T4.5): o pedido já estava sendo trabalhado
 * pela distribuidora e não foi ela quem cancelou.
 */
const IN_PROGRESS_STATUSES = new Set([
  "ACCEPTED_BY_DISTRIBUTOR",
  "READY_FOR_DISPATCH",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "REDELIVERY_SCHEDULED",
]);

export function cancellationToastMessage(payload: OrderStatusChangedPayload): string | null {
  if (payload.status !== "CANCELLED") return null;
  const previous = typeof payload.previousStatus === "string" ? payload.previousStatus : null;
  if (!previous || !IN_PROGRESS_STATUSES.has(previous)) return null;
  if (payload.cancelledBy === "distributor") return null;

  const label = `Pedido #${payload.orderId.slice(0, 8).toUpperCase()}`;
  const by =
    payload.cancelledBy === "consumer"
      ? " pelo cliente"
      : payload.cancelledBy === "ops"
        ? " pelo suporte Xuá"
        : "";
  return `${label} foi cancelado${by}`;
}
