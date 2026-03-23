// Re-exporta tipos gerados pelo Prisma + enums
export type {
  Consumer,
  Address,
  Distributor,
  Zone,
  ZoneCoverage,
  Product,
  DeliveryCapacity,
  ConsumerPushToken,
  Order,
  OrderItem,
  Subscription,
  SubscriptionOrder,
  Payment,
  PaymentWebhookEvent,
  Deposit,
  OrderOtp,
  Reconciliation,
  AuditEvent,
} from "@prisma/client";

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

// ─── JWT Payload (manual — não é modelo do banco) ──────────────
export interface JwtPayload {
  sub: string;
  role: "consumer" | "distributor_admin" | "operator" | "driver" | "ops" | "support";
  name: string;
  jti: string;
  iat: number;
  exp: number;
}
