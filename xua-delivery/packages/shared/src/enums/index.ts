type EnumValue<T extends Record<string, string>> = T[keyof T];

// Enums de dominio expostos pelo Prisma Client. O schema Prisma pode mapear
// alguns valores para lowercase no banco, mas o contrato TypeScript permanece
// com os nomes de enum abaixo.

export const DELIVERY_WINDOW_VALUES = ["MORNING", "AFTERNOON"] as const;
export const DELIVERY_WINDOW_INPUT_VALUES = ["morning", "afternoon"] as const;

export const DeliveryWindow = {
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
} as const;
export type DeliveryWindow = EnumValue<typeof DeliveryWindow>;
export type DeliveryWindowInput = (typeof DELIVERY_WINDOW_INPUT_VALUES)[number];

export const ORDER_STATUS_VALUES = [
  "DRAFT",
  "CREATED",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "SENT_TO_DISTRIBUTOR",
  "ACCEPTED_BY_DISTRIBUTOR",
  "REJECTED_BY_DISTRIBUTOR",
  "PICKING",
  "READY_FOR_DISPATCH",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "REDELIVERY_SCHEDULED",
  "CANCELLED",
] as const;

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
export type OrderStatus = EnumValue<typeof OrderStatus>;

export const OTP_STATUS_VALUES = ["ACTIVE", "USED", "EXPIRED", "LOCKED"] as const;

export const OtpStatus = {
  ACTIVE: "ACTIVE",
  USED: "USED",
  EXPIRED: "EXPIRED",
  LOCKED: "LOCKED",
} as const;
export type OtpStatus = EnumValue<typeof OtpStatus>;

export const CONSUMER_ROLE_VALUES = [
  "CONSUMER",
  "DISTRIBUTOR_ADMIN",
  "DRIVER",
  "SUPPORT",
  "OPS",
] as const;

export const ConsumerRole = {
  CONSUMER: "CONSUMER",
  DISTRIBUTOR_ADMIN: "DISTRIBUTOR_ADMIN",
  DRIVER: "DRIVER",
  SUPPORT: "SUPPORT",
  OPS: "OPS",
} as const;
export type ConsumerRole = EnumValue<typeof ConsumerRole>;

export const USER_SUBSCRIPTION_STATUS_VALUES = [
  "PENDING_PAYMENT",
  "ACTIVE",
  "PAUSED",
  "CANCELLED",
  "COMPLETED",
] as const;

export const UserSubscriptionStatus = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;
export type UserSubscriptionStatus = EnumValue<typeof UserSubscriptionStatus>;

export const DELIVERY_DATE_STATUS_VALUES = ["PENDING", "DELIVERED", "CANCELLED"] as const;

export const DeliveryDateStatus = {
  PENDING: "PENDING",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;
export type DeliveryDateStatus = EnumValue<typeof DeliveryDateStatus>;

export const PAYMENT_KIND_VALUES = ["ORDER", "SUBSCRIPTION", "DEPOSIT"] as const;

export const PaymentKind = {
  ORDER: "ORDER",
  SUBSCRIPTION: "SUBSCRIPTION",
  DEPOSIT: "DEPOSIT",
} as const;
export type PaymentKind = EnumValue<typeof PaymentKind>;

export const PAYMENT_STATUS_VALUES = [
  "CREATED",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
  "EXPIRED",
] as const;

 export const PaymentStatus = {
  CREATED: "CREATED",
  AUTHORIZED: "AUTHORIZED",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  EXPIRED: "EXPIRED",
} as const;
export type PaymentStatus = EnumValue<typeof PaymentStatus>;

export const DEPOSIT_STATUS_VALUES = [
  "HELD",
  "REFUND_INITIATED",
  "REFUNDED",
  "FORFEITED",
  "CANCELLED",
] as const;

export const DepositStatus = {
  HELD: "HELD",
  REFUND_INITIATED: "REFUND_INITIATED",
  REFUNDED: "REFUNDED",
  FORFEITED: "FORFEITED",
  CANCELLED: "CANCELLED",
} as const;
export type DepositStatus = EnumValue<typeof DepositStatus>;

export const PRODUCT_KIND_VALUES = ["WATER", "BOTTLE", "OTHER"] as const;

export const ProductKind = {
  WATER: "WATER",
  BOTTLE: "BOTTLE",
  OTHER: "OTHER",
} as const;
export type ProductKind = EnumValue<typeof ProductKind>;

export const ACTOR_TYPE_VALUES = [
  "CONSUMER",
  "DISTRIBUTOR_USER",
  "DRIVER",
  "SUPPORT",
  "OPS",
  "SYSTEM",
] as const;

export const ActorType = {
  CONSUMER: "CONSUMER",
  DISTRIBUTOR_USER: "DISTRIBUTOR_USER",
  DRIVER: "DRIVER",
  SUPPORT: "SUPPORT",
  OPS: "OPS",
  SYSTEM: "SYSTEM",
} as const;
export type ActorType = EnumValue<typeof ActorType>;

export const SOURCE_APP_VALUES = [
  "CONSUMER_WEB",
  "DISTRIBUTOR_WEB",
  "DRIVER_WEB",
  "OPS_CONSOLE",
  "BACKEND",
] as const;

export const SourceApp = {
  CONSUMER_WEB: "CONSUMER_WEB",
  DISTRIBUTOR_WEB: "DISTRIBUTOR_WEB",
  DRIVER_WEB: "DRIVER_WEB",
  OPS_CONSOLE: "OPS_CONSOLE",
  BACKEND: "BACKEND",
} as const;
export type SourceApp = EnumValue<typeof SourceApp>;

export const AUDIT_EVENT_TYPE_VALUES = [
  "ORDER_CREATED",
  "ORDER_PRICING_FINALIZED",
  "ORDER_CONFIRMED",
  "ORDER_CANCELLED",
  "ORDER_RECEIVED_BY_DISTRIBUTOR",
  "ORDER_ACCEPTED_BY_DISTRIBUTOR",
  "ORDER_REJECTED_BY_DISTRIBUTOR",
  "ORDER_DRIVER_ASSIGNED",
  "DISPATCH_CHECKLIST_COMPLETED",
  "ORDER_DISPATCHED",
  "OTP_GENERATED",
  "OTP_SENT",
  "OTP_VALIDATION_ATTEMPTED",
  "OTP_OVERRIDE",
  "ORDER_DELIVERED",
  "BOTTLE_EXCHANGE_RECORDED",
  "EMPTY_NOT_COLLECTED",
  "REDELIVERY_REQUIRED",
  "REDELIVERY_SCHEDULED",
  "PAYMENT_CREATED",
  "PAYMENT_CAPTURED",
  "PAYMENT_FAILED",
  "PAYMENT_EXPIRED",
  "DEPOSIT_HELD",
  "DEPOSIT_REFUND_INITIATED",
  "DEPOSIT_REFUNDED",
  "DAILY_RECONCILIATION_CLOSED",
  "DEPOSIT_BOTTLES_LOANED",
  "DEPOSIT_BOTTLES_RETURNED",
  "DEPOSIT_BOTTLES_WRITTEN_OFF",
  "DEPOSIT_PROGRAM_ENABLED",
  "DEPOSIT_PROGRAM_DISABLED",
] as const;

export const AuditEventType = {
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_PRICING_FINALIZED: "ORDER_PRICING_FINALIZED",
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_RECEIVED_BY_DISTRIBUTOR: "ORDER_RECEIVED_BY_DISTRIBUTOR",
  ORDER_ACCEPTED_BY_DISTRIBUTOR: "ORDER_ACCEPTED_BY_DISTRIBUTOR",
  ORDER_REJECTED_BY_DISTRIBUTOR: "ORDER_REJECTED_BY_DISTRIBUTOR",
  ORDER_DRIVER_ASSIGNED: "ORDER_DRIVER_ASSIGNED",
  DISPATCH_CHECKLIST_COMPLETED: "DISPATCH_CHECKLIST_COMPLETED",
  ORDER_DISPATCHED: "ORDER_DISPATCHED",
  OTP_GENERATED: "OTP_GENERATED",
  OTP_SENT: "OTP_SENT",
  OTP_VALIDATION_ATTEMPTED: "OTP_VALIDATION_ATTEMPTED",
  OTP_OVERRIDE: "OTP_OVERRIDE",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  BOTTLE_EXCHANGE_RECORDED: "BOTTLE_EXCHANGE_RECORDED",
  EMPTY_NOT_COLLECTED: "EMPTY_NOT_COLLECTED",
  REDELIVERY_REQUIRED: "REDELIVERY_REQUIRED",
  REDELIVERY_SCHEDULED: "REDELIVERY_SCHEDULED",
  PAYMENT_CREATED: "PAYMENT_CREATED",
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_EXPIRED: "PAYMENT_EXPIRED",
  DEPOSIT_HELD: "DEPOSIT_HELD",
  DEPOSIT_REFUND_INITIATED: "DEPOSIT_REFUND_INITIATED",
  DEPOSIT_REFUNDED: "DEPOSIT_REFUNDED",
  DAILY_RECONCILIATION_CLOSED: "DAILY_RECONCILIATION_CLOSED",
  DEPOSIT_BOTTLES_LOANED: "DEPOSIT_BOTTLES_LOANED",
  DEPOSIT_BOTTLES_RETURNED: "DEPOSIT_BOTTLES_RETURNED",
  DEPOSIT_BOTTLES_WRITTEN_OFF: "DEPOSIT_BOTTLES_WRITTEN_OFF",
  DEPOSIT_PROGRAM_ENABLED: "DEPOSIT_PROGRAM_ENABLED",
  DEPOSIT_PROGRAM_DISABLED: "DEPOSIT_PROGRAM_DISABLED",
} as const;
export type AuditEventType = EnumValue<typeof AuditEventType>;

export const IDEMPOTENCY_STATUS_VALUES = ["PENDING", "PROCESSED", "FAILED"] as const;

export const IdempotencyStatus = {
  PENDING: "PENDING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
} as const;
export type IdempotencyStatus = EnumValue<typeof IdempotencyStatus>;

export const BANNER_TYPE_VALUES = ["CAROUSEL", "FEATURED"] as const;

export const BannerType = {
  CAROUSEL: "CAROUSEL",
  FEATURED: "FEATURED",
} as const;
export type BannerType = EnumValue<typeof BannerType>;

export const INVENTORY_ITEM_TYPE_VALUES = [
  "SELLABLE_PRODUCT",
  "RETURNABLE_FULL",
  "RETURNABLE_EMPTY",
  "SUPPLY",
] as const;

export const InventoryItemType = {
  SELLABLE_PRODUCT: "SELLABLE_PRODUCT",
  RETURNABLE_FULL: "RETURNABLE_FULL",
  RETURNABLE_EMPTY: "RETURNABLE_EMPTY",
  SUPPLY: "SUPPLY",
} as const;
export type InventoryItemType = EnumValue<typeof InventoryItemType>;

export const INVENTORY_MOVEMENT_TYPE_VALUES = [
  "INITIAL_LOAD",
  "ORDER_ACCEPT_OUT",
  "ORDER_CANCEL_RETURN",
  "DELIVERY_FAILED_RETURN",
  "EMPTY_RETURN_IN",
  "RECONCILIATION_ADJUSTMENT",
  "MANUAL_CORRECTION",
  "LOSS_WRITE_OFF",
  "PURCHASE_IN",
  "DEPOSIT_LOAN_OUT",
  "DEPOSIT_RETURN_IN",
] as const;

export const InventoryMovementType = {
  INITIAL_LOAD: "INITIAL_LOAD",
  ORDER_ACCEPT_OUT: "ORDER_ACCEPT_OUT",
  ORDER_CANCEL_RETURN: "ORDER_CANCEL_RETURN",
  DELIVERY_FAILED_RETURN: "DELIVERY_FAILED_RETURN",
  EMPTY_RETURN_IN: "EMPTY_RETURN_IN",
  RECONCILIATION_ADJUSTMENT: "RECONCILIATION_ADJUSTMENT",
  MANUAL_CORRECTION: "MANUAL_CORRECTION",
  LOSS_WRITE_OFF: "LOSS_WRITE_OFF",
  PURCHASE_IN: "PURCHASE_IN",
  DEPOSIT_LOAN_OUT: "DEPOSIT_LOAN_OUT",
  DEPOSIT_RETURN_IN: "DEPOSIT_RETURN_IN",
} as const;
export type InventoryMovementType = EnumValue<typeof InventoryMovementType>;

export const DEPOSIT_MOVEMENT_TYPE_VALUES = [
  "LOAN_OUT",
  "RETURN_IN",
  "MANUAL_ADJUSTMENT",
  "WRITE_OFF",
] as const;

export const DepositMovementType = {
  LOAN_OUT: "LOAN_OUT",
  RETURN_IN: "RETURN_IN",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
  WRITE_OFF: "WRITE_OFF",
} as const;
export type DepositMovementType = EnumValue<typeof DepositMovementType>;

export const INVENTORY_REFERENCE_TYPE_VALUES = [
  "ORDER",
  "RECONCILIATION_SESSION",
  "INITIAL_LOAD",
  "MANUAL_ADJUSTMENT",
  "PURCHASE",
  "SYSTEM",
] as const;

export const InventoryReferenceType = {
  ORDER: "ORDER",
  RECONCILIATION_SESSION: "RECONCILIATION_SESSION",
  INITIAL_LOAD: "INITIAL_LOAD",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
  PURCHASE: "PURCHASE",
  SYSTEM: "SYSTEM",
} as const;
export type InventoryReferenceType = EnumValue<typeof InventoryReferenceType>;

export const INVENTORY_RECONCILIATION_STATUS_VALUES = ["OPEN", "CLOSED"] as const;

export const InventoryReconciliationStatus = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;
export type InventoryReconciliationStatus = EnumValue<typeof InventoryReconciliationStatus>;

export const BOTTLE_CONDITION_VALUES = ["ok", "damaged", "dirty"] as const;
export type BottleCondition = (typeof BOTTLE_CONDITION_VALUES)[number];

export const NON_COLLECTION_REASON_VALUES = [
  "client_absent",
  "no_access",
  "no_empty_bottles",
  "unsafe_location",
  "other",
] as const;
export type NonCollectionReason = (typeof NON_COLLECTION_REASON_VALUES)[number];

export const REJECT_ORDER_REASON_VALUES = [
  "out_of_stock",
  "delivery_area_issue",
  "operational_capacity",
  "other",
] as const;
export type RejectOrderReason = (typeof REJECT_ORDER_REASON_VALUES)[number];

export const ONLINE_PAYMENT_METHOD_VALUES = ["pix", "credit"] as const;
export type OnlinePaymentMethod = (typeof ONLINE_PAYMENT_METHOD_VALUES)[number];

export const CHECKOUT_PAYMENT_METHOD_VALUES = ["pix", "credit", "cash", "card_on_delivery"] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHOD_VALUES)[number];

export const USER_SUBSCRIPTION_PAYMENT_METHOD_VALUES = ONLINE_PAYMENT_METHOD_VALUES;
export type UserSubscriptionPaymentMethodValue = (typeof USER_SUBSCRIPTION_PAYMENT_METHOD_VALUES)[number];
