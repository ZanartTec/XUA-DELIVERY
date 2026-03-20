// Interfaces das 19 tabelas — seção 2.1 do guia técnico
import type {
  OrderStatus,
  DeliveryWindow,
  OtpStatus,
  SubscriptionStatus,
  PaymentKind,
  PaymentStatus,
  DepositStatus,
  ActorType,
  SourceApp,
  AuditEventType,
} from "./enums";

export type {
  OrderStatus,
  DeliveryWindow,
  OtpStatus,
  SubscriptionStatus,
  PaymentKind,
  PaymentStatus,
  DepositStatus,
  ActorType,
  SourceApp,
  AuditEventType,
} from "./enums";

// ─── 01_mst_consumers ──────────────────────────────────────────
export interface Consumer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  is_b2b: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── 02_mst_addresses ──────────────────────────────────────────
export interface Address {
  id: string;
  consumer_id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  zone_id: string | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── 03_mst_distributors ───────────────────────────────────────
export interface Distributor {
  id: string;
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  acceptance_sla_seconds: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── 04_mst_zones ──────────────────────────────────────────────
export interface Zone {
  id: string;
  distributor_id: string;
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── 05_mst_zone_coverage ──────────────────────────────────────
export interface ZoneCoverage {
  id: string;
  zone_id: string;
  neighborhood: string | null;
  zip_code: string | null;
  created_at: Date;
}

// ─── 06_mst_products ───────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  deposit_cents: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── 07_cfg_delivery_capacity ──────────────────────────────────
export interface DeliveryCapacity {
  id: string;
  zone_id: string;
  delivery_date: string; // DATE
  window: DeliveryWindow;
  capacity_total: number;
  capacity_reserved: number;
  created_at: Date;
  updated_at: Date;
}

// ─── 08_sec_consumer_push_tokens ───────────────────────────────
export interface ConsumerPushToken {
  id: string;
  consumer_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: Date;
}

// ─── 09_trn_orders ─────────────────────────────────────────────
export interface Order {
  id: string;
  consumer_id: string;
  address_id: string;
  distributor_id: string;
  zone_id: string;
  status: OrderStatus;
  delivery_date: string;
  delivery_window: DeliveryWindow;
  subtotal_cents: number;
  delivery_fee_cents: number;
  deposit_cents: number;
  total_cents: number;
  rating: number | null;
  rating_comment: string | null;
  collected_empty_qty: number;
  cancellation_reason: string | null;
  accepted_at: Date | null;
  dispatched_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── 10_trn_order_items ────────────────────────────────────────
export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  subtotal_cents: number;
  created_at: Date;
}

// ─── 11_trn_subscriptions ──────────────────────────────────────
export interface Subscription {
  id: string;
  consumer_id: string;
  address_id: string;
  product_id: string;
  quantity: number;
  delivery_window: DeliveryWindow;
  delivery_day_of_month: number;
  status: SubscriptionStatus;
  next_delivery_date: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── 12_piv_subscription_orders ────────────────────────────────
export interface SubscriptionOrder {
  subscription_id: string;
  order_id: string;
  created_at: Date;
}

// ─── 13_trn_payments ───────────────────────────────────────────
export interface Payment {
  id: string;
  order_id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_cents: number;
  provider: string;
  provider_payment_ref: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── 14_cfg_payment_webhook_events ─────────────────────────────
export interface PaymentWebhookEvent {
  id: string;
  provider: string;
  provider_event_ref: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

// ─── 15_trn_deposits ───────────────────────────────────────────
export interface Deposit {
  id: string;
  order_id: string;
  consumer_id: string;
  amount_cents: number;
  status: DepositStatus;
  refunded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── 16_sec_order_otps ─────────────────────────────────────────
export interface OrderOtp {
  id: string;
  order_id: string;
  otp_hash: string;
  status: OtpStatus;
  attempts: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

// ─── 17_trn_reconciliations ────────────────────────────────────
export interface Reconciliation {
  id: string;
  distributor_id: string;
  reconciliation_date: string;
  full_out: number;
  empty_returned: number;
  delta: number;
  justification: string | null;
  closed_by: string;
  created_at: Date;
}

// ─── 18_aud_audit_events ───────────────────────────────────────
export interface AuditEvent {
  id: string;
  event_type: AuditEventType;
  actor_type: ActorType;
  actor_id: string;
  order_id: string | null;
  source_app: SourceApp;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

// ─── JWT Payload ───────────────────────────────────────────────
export interface JwtPayload {
  sub: string;
  role: "consumer" | "distributor_admin" | "operator" | "driver" | "ops" | "support";
  name: string;
  iat: number;
  exp: number;
}
