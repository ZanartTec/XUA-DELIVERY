"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import type { Order } from "@/src/types";

export type OrdersFilterValue = "all" | "active" | "delivered" | "cancelled";

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  summary: { all: number; active: number; delivered: number; cancelled: number };
}

const PAGE_SIZE = 6;

export function useOrders(filter: OrdersFilterValue, page: number) {
  const query = useQuery({
    queryKey: ["orders", { filter, page }],
    queryFn: () =>
      api.get<OrdersResponse>(
        `/api/orders?statusGroup=${filter}&page=${page}&limit=${PAGE_SIZE}`
      ),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
