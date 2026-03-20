// Constantes centralizadas para nomes de tabelas do banco de dados.
// Evita inconsistência entre Route Handlers e Repositories (ARCH-02).

export const TABLES = {
  CONSUMERS: "01_mst_consumers",
  ADDRESSES: "02_mst_addresses",
  DISTRIBUTORS: "03_mst_distributors",
  ZONES: "04_mst_zones",
  ZONE_COVERAGE: "05_mst_zone_coverage",
  PRODUCTS: "06_mst_products",
  DELIVERY_CAPACITY: "07_cfg_delivery_capacity",
  PUSH_TOKENS: "08_sec_consumer_push_tokens",
  ORDERS: "09_trn_orders",
  ORDER_ITEMS: "10_trn_order_items",
  SUBSCRIPTIONS: "11_trn_subscriptions",
  SUBSCRIPTION_ORDERS: "12_piv_subscription_orders",
  PAYMENTS: "13_trn_payments",
  WEBHOOK_EVENTS: "14_cfg_payment_webhook_events",
  DEPOSITS: "15_trn_deposits",
  ORDER_OTPS: "16_sec_order_otps",
  RECONCILIATIONS: "17_trn_reconciliations",
  AUDIT_EVENTS: "18_aud_audit_events",
} as const;
