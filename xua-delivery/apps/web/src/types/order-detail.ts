import type { Order } from "@/src/types";

export interface OrderDetailEvent {
  status: string;
  timestamp: string;
  actor?: string | null;
  actor_type?: string | null;
  source_app?: string | null;
}

export interface OrderDetailPayment {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  payment_method?: string | null;
  cash_change_for_cents?: number | null;
  provider?: string | null;
  paid_at?: string | null;
  created_at?: string;
}

export interface OrderDetailItem {
  product_name: string;
  qty: number;
  unit_price_cents: number;
  subtotal_cents: number;
  image_url?: string | null;
}

export interface OrderDetailAddress {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood?: string | null;
  city: string;
  state: string;
  zip_code?: string | null;
}

/** Pedido completo, retornado por GET /api/orders/:id — usado no modal da fila e na página de detalhe. */
export interface OrderDetail extends Order {
  items: OrderDetailItem[];
  events: OrderDetailEvent[];
  payments: OrderDetailPayment[];
  consumer_name: string;
  address_details: OrderDetailAddress;
  consumer_email?: string | null;
  consumer_phone?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  sla_deadline?: string | null;
  total_items_qty: number;
  order_origin?: "cart" | "subscription";
  user_subscription_id?: string | null;
  subscription_delivery_date_id?: string | null;
  subscription_plan_name?: string | null;
  subscription_status?: string | null;
  subscription_delivery_status?: string | null;
  delivery_sequence?: number | null;
  total_deliveries?: number | null;
  completed_deliveries?: number | null;
  remaining_deliveries?: number | null;
  remaining_after_current?: number | null;
  quantity_for_this_delivery?: number | null;
  subscription_total_quantity?: number | null;
  subscription_remaining_quantity?: number | null;
}
