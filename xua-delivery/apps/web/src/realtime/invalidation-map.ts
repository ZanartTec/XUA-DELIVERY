import type { RealtimeEventName, RealtimePayloads } from "@xua/shared/realtime/events";

export type QueryKey = readonly unknown[];

/**
 * Evento de tempo real → chaves do React Query a invalidar.
 *
 * O socket só diz "algo mudou"; a tela relê da API (D1). As chaves são
 * prefixos: `["order", id]` também atinge `["order", id, "retry"]`. Invalidar
 * uma chave que esta aba não usa é grátis (não há query ativa para refazer).
 */
export function keysFor<E extends RealtimeEventName>(event: E, payload: RealtimePayloads[E]): QueryKey[] {
  const orderId = (payload as { orderId?: unknown } | null | undefined)?.orderId;
  const id = typeof orderId === "string" && orderId ? orderId : null;
  const perOrder = (prefix: string): QueryKey[] => (id ? [[prefix, id]] : [[prefix]]);

  switch (event) {
    case "new_order":
      return [["distributor-queue"], ["kpis"]];

    case "order_status_changed":
      return [
        ["distributor-queue"],
        ...perOrder("distributor-order-detail"),
        ["distributor-route"],
        ...perOrder("order"),
        ["orders"],
        ["driver-deliveries"],
        ["driver-history"],
        ...perOrder("support-order"),
        ["kpis"],
      ];

    case "new_delivery":
    case "delivery_assigned":
      return [["driver-deliveries"], ...perOrder("order")];

    case "otp_generated":
      return perOrder("order");

    case "otp_locked":
      return [["otp-override"], ...perOrder("support-order")];

    case "bottle_step_recorded":
      return [...perOrder("order"), ...perOrder("distributor-order-detail")];

    default:
      return [];
  }
}

/**
 * Chaves "ao vivo": relidas ao reconectar, ao voltar para a aba e ao voltar a
 * ficar online, porque eventos podem ter sido perdidos nesse intervalo (F3).
 */
export const LIVE_QUERY_KEYS: readonly QueryKey[] = [
  ["distributor-queue"],
  ["distributor-order-detail"],
  ["driver-deliveries"],
  ["orders"],
  ["order"],
  ["support-order"],
  ["otp-override"],
  ["kpis"],
];
