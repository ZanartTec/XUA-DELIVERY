"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import type { OrderDetail } from "@/src/types/order-detail";

interface OrderDetailResponse {
  order: OrderDetail;
}

/**
 * Busca o detalhe completo do pedido (itens, timeline, pagamentos, assinatura)
 * para as telas do distribuidor (fila e página de detalhe).
 *
 * Chave de cache própria (não compartilhada com `consumer/use-order-detail`):
 * o mesmo endpoint devolve campos diferentes por role (ex.: otp_code só para
 * consumer), então cada persona mantém sua própria entrada de cache.
 */
export function useOrderDetail(id: string | null) {
  const query = useQuery({
    queryKey: ["distributor-order-detail", id],
    queryFn: () => api.get<OrderDetailResponse>(`/api/orders/${id}`),
    enabled: Boolean(id),
  });

  return {
    order: query.data?.order ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
