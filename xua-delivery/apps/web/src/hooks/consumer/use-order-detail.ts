"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import type { Order } from "@/src/types";
import type { TimelineEvent } from "@/src/components/shared/order-timeline";

export interface PaymentSummary {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  payment_method?: string | null;
  cash_change_for_cents?: number | null;
  provider?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface OtpSummary {
  id: string;
  status: string;
  attempts: number;
  expires_at: string;
  created_at: string;
}

export interface OrderDetail extends Order {
  items: {
    product_name: string;
    qty: number;
    unit_price_cents: number;
    subtotal_cents: number;
    image_url: string | null;
  }[];
  events: TimelineEvent[];
  payments: PaymentSummary[];
  otps: OtpSummary[];
  otp_code?: string;
  consumer_name: string;
  consumer_email?: string | null;
  consumer_phone?: string | null;
  distributor_name: string;
  distributor_phone?: string | null;
  distributor_email?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  zone_name: string;
  sla_deadline?: string | null;
  total_items_qty: number;
  time_slot?: {
    label: string;
    start_hour: number;
    start_minute: number;
    end_hour: number;
    end_minute: number;
  } | null;
  address_line?: string;
  address_details?: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
  };
}

interface OrderDetailResponse {
  order: OrderDetail;
}

export function useOrderDetail(id: string) {
  const query = useQuery({
    queryKey: ["order", id],
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
