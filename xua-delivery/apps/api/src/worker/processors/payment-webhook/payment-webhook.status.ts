import { AuditEventType, PaymentStatus } from "@xua/shared/enums";
import type { ProviderPaymentDetails } from "../../../modules/payments/gateway/payments.gateway.js";
import { NonRetryablePaymentWebhookError } from "./payment-webhook.types.js";

const ORDER_PAYMENT_STATUS_BY_PAYMENT_STATUS: Record<PaymentStatus, string> = {
  [PaymentStatus.CAPTURED]: "paid",
  [PaymentStatus.FAILED]: "failed",
  [PaymentStatus.REFUNDED]: "refunded",
  [PaymentStatus.AUTHORIZED]: "pending",
  [PaymentStatus.CREATED]: "pending",
  [PaymentStatus.EXPIRED]: "expired",
};

const AUDIT_EVENT_BY_PAYMENT_STATUS: Record<PaymentStatus, AuditEventType> = {
  [PaymentStatus.CAPTURED]: AuditEventType.PAYMENT_CAPTURED,
  [PaymentStatus.FAILED]: AuditEventType.PAYMENT_FAILED,
  [PaymentStatus.REFUNDED]: AuditEventType.PAYMENT_REFUNDED,
  [PaymentStatus.AUTHORIZED]: AuditEventType.PAYMENT_CREATED,
  [PaymentStatus.CREATED]: AuditEventType.PAYMENT_CREATED,
  [PaymentStatus.EXPIRED]: AuditEventType.PAYMENT_EXPIRED,
};

const STATUS_REGRESSIONS: Partial<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  [PaymentStatus.REFUNDED]: [
    PaymentStatus.CREATED,
    PaymentStatus.AUTHORIZED,
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.CAPTURED]: [PaymentStatus.CREATED],
  [PaymentStatus.FAILED]: [PaymentStatus.CREATED],
};

const EXACT_AMOUNT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.CAPTURED,
  PaymentStatus.AUTHORIZED,
]);

export function paymentStatusToOrderPaymentStatus(status: PaymentStatus): string {
  return ORDER_PAYMENT_STATUS_BY_PAYMENT_STATUS[status];
}

export function auditEventForPaymentStatus(status: PaymentStatus): AuditEventType {
  return AUDIT_EVENT_BY_PAYMENT_STATUS[status];
}

export function isInvalidRegression(current: PaymentStatus, next: PaymentStatus): boolean {
  return STATUS_REGRESSIONS[current]?.includes(next) ?? false;
}

export function assertPaymentAmountMatches(
  expectedAmountCents: number,
  providerPayment: ProviderPaymentDetails,
  nextStatus: PaymentStatus
): void {
  if (!EXACT_AMOUNT_STATUSES.has(nextStatus)) return;

  if (!Number.isFinite(providerPayment.amountCents) || providerPayment.amountCents <= 0) {
    throw new NonRetryablePaymentWebhookError(
      `PAYMENT_AMOUNT_MISSING:${providerPayment.providerPaymentId}`
    );
  }

  if (expectedAmountCents > 0 && expectedAmountCents !== providerPayment.amountCents) {
    throw new NonRetryablePaymentWebhookError(
      `PAYMENT_AMOUNT_MISMATCH:${expectedAmountCents}:${providerPayment.amountCents}`
    );
  }
}
