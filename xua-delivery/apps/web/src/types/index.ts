// Re-exporta tipos gerados pelo Prisma + enums
export type {
  Consumer,
  Address,
  Distributor,
  Zone,
  ZoneCoverage,
  Product,
  ConsumerPushToken,
  Order,
  OrderItem,
  TimeSlot,
  Payment,
  PaymentWebhookEvent,
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
  ActorType,
  SourceApp,
  AuditEventType,
} from "@xua/shared/enums";

// --- JWT Payload — importado do shared (fonte de verdade) ----------
export type { JwtPayload } from "@xua/shared/types";
