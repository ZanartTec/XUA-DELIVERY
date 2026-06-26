import { PaymentStatus } from "@xua/shared/enums";

export const CASH_PAYMENT_PROVIDER = "local";
export const CASH_PAYMENT_PENDING_STATUS = "pending_cash";
export const PAYMENT_PAID_STATUS = "paid";

export const CASH_PAYMENT_INVALID_CAPTURE_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
  PaymentStatus.EXPIRED,
]);

export const CASH_PAYMENT_CAPTURABLE_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.CREATED,
  PaymentStatus.AUTHORIZED,
]);
