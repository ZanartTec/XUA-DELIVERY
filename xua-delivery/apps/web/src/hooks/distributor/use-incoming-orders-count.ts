"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { useFallbackRefetchInterval } from "@/src/realtime/realtime-provider";

/**
 * Pedidos aguardando aceite (SENT_TO_DISTRIBUTOR), para o badge do menu (T4.4).
 * Usa o `summary` que a fila já devolve, com `limit=1` para não trazer a lista.
 * A chave começa com "distributor-queue", então todo `new_order` e
 * `order_status_changed` já a invalidam pelo mapa do RealtimeProvider.
 */
export function useIncomingOrdersCount(enabled: boolean): number {
  const refetchInterval = useFallbackRefetchInterval();
  const query = useQuery({
    queryKey: ["distributor-queue", "incoming-count"],
    queryFn: async () =>
      (await api.get<{ summary?: { incoming?: number } }>(
        "/api/orders?scope=distributor&stage=incoming&page=1&limit=1"
      )).summary?.incoming ?? 0,
    enabled,
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: 15_000,
  });
  return enabled ? query.data ?? 0 : 0;
}
