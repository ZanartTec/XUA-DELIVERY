// Re-exporta enums de dominio centralizados no shared.
export {
  DeliveryWindow,
  OrderStatus,
  OtpStatus,
  PaymentKind,
  PaymentStatus,
  DepositStatus,
  ActorType,
  ConsumerRole,
  SourceApp,
  AuditEventType,
  IdempotencyStatus,
  UserSubscriptionStatus,
  DeliveryDateStatus,
  BannerType,
} from "@xua/shared/enums";

export type {
  DeliveryWindow as DeliveryWindowValue,
  OrderStatus as OrderStatusValue,
  OtpStatus as OtpStatusValue,
  PaymentKind as PaymentKindValue,
  PaymentStatus as PaymentStatusValue,
  DepositStatus as DepositStatusValue,
  ActorType as ActorTypeValue,
  ConsumerRole as ConsumerRoleValue,
  SourceApp as SourceAppValue,
  AuditEventType as AuditEventTypeValue,
  IdempotencyStatus as IdempotencyStatusValue,
  UserSubscriptionStatus as UserSubscriptionStatusValue,
  DeliveryDateStatus as DeliveryDateStatusValue,
  BannerType as BannerTypeValue,
} from "@xua/shared/enums";
