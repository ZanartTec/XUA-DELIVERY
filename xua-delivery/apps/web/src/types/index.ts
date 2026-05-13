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
  TimeSlot,
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
  PaymentKind,
  PaymentStatus,
  DepositStatus,
  ActorType,
  SourceApp,
  AuditEventType,
} from "./enums";

// --- JWT Payload — importado do shared (fonte de verdade) ----------
export type { JwtPayload } from "@xua/shared/types";
