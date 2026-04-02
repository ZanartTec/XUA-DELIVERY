// ─── Enums independentes do Prisma — mesmos valores gerados pelo Prisma ───
// Usados no web, shared e API (antes de ter acesso ao @prisma/client).
// Mantenha sincronizado com prisma/schema.prisma.

export const DeliveryWindow = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
} as const;
export type DeliveryWindow = (typeof DeliveryWindow)[keyof typeof DeliveryWindow];

export const OrderStatus = {
  DRAFT: "DRAFT",
  CREATED: "CREATED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  CONFIRMED: "CONFIRMED",
  SENT_TO_DISTRIBUTOR: "SENT_TO_DISTRIBUTOR",
  ACCEPTED_BY_DISTRIBUTOR: "ACCEPTED_BY_DISTRIBUTOR",
  REJECTED_BY_DISTRIBUTOR: "REJECTED_BY_DISTRIBUTOR",
  PICKING: "PICKING",
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  REDELIVERY_SCHEDULED: "REDELIVERY_SCHEDULED",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OtpStatus = {
  ACTIVE: "active",
  USED: "used",
  EXPIRED: "expired",
  LOCKED: "locked",
} as const;
export type OtpStatus = (typeof OtpStatus)[keyof typeof OtpStatus];

export const SubscriptionStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELLED: "cancelled",
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const PaymentKind = {
  ORDER: "order",
  SUBSCRIPTION: "subscription",
  DEPOSIT: "deposit",
} as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];

export const PaymentStatus = {
  CREATED: "created",
  AUTHORIZED: "authorized",
  CAPTURED: "captured",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const DepositStatus = {
  HELD: "held",
  REFUND_INITIATED: "refund_initiated",
  REFUNDED: "refunded",
  FORFEITED: "forfeited",
} as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

export const ActorType = {
  CONSUMER: "consumer",
  DISTRIBUTOR_USER: "distributor_user",
  DRIVER: "driver",
  SUPPORT: "support",
  OPS: "ops",
  SYSTEM: "system",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const SourceApp = {
  CONSUMER_WEB: "consumer_web",
  DISTRIBUTOR_WEB: "distributor_web",
  DRIVER_WEB: "driver_web",
  OPS_CONSOLE: "ops_console",
  BACKEND: "backend",
} as const;
export type SourceApp = (typeof SourceApp)[keyof typeof SourceApp];

export const AuditEventType = {
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_PRICING_FINALIZED: "ORDER_PRICING_FINALIZED",
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_RECEIVED_BY_DISTRIBUTOR: "ORDER_RECEIVED_BY_DISTRIBUTOR",
  ORDER_ACCEPTED_BY_DISTRIBUTOR: "ORDER_ACCEPTED_BY_DISTRIBUTOR",
  ORDER_REJECTED_BY_DISTRIBUTOR: "ORDER_REJECTED_BY_DISTRIBUTOR",
  DISPATCH_CHECKLIST_COMPLETED: "DISPATCH_CHECKLIST_COMPLETED",
  ORDER_DISPATCHED: "ORDER_DISPATCHED",
  OTP_GENERATED: "OTP_GENERATED",
  OTP_SENT: "OTP_SENT",
  OTP_VALIDATION_ATTEMPTED: "OTP_VALIDATION_ATTEMPTED",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  BOTTLE_EXCHANGE_RECORDED: "BOTTLE_EXCHANGE_RECORDED",
  EMPTY_NOT_COLLECTED: "EMPTY_NOT_COLLECTED",
  REDELIVERY_REQUIRED: "REDELIVERY_REQUIRED",
  REDELIVERY_SCHEDULED: "REDELIVERY_SCHEDULED",
  PAYMENT_CREATED: "PAYMENT_CREATED",
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  DEPOSIT_HELD: "DEPOSIT_HELD",
  DEPOSIT_REFUND_INITIATED: "DEPOSIT_REFUND_INITIATED",
  DEPOSIT_REFUNDED: "DEPOSIT_REFUNDED",
  DAILY_RECONCILIATION_CLOSED: "DAILY_RECONCILIATION_CLOSED",
} as const;
export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];
