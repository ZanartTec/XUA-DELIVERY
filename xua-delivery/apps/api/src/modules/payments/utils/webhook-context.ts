import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentKind, type PaymentKind as PaymentKindValue } from "@xua/shared/enums";

export const WEBHOOK_CONTEXT_QUERY_PARAMS = {
  referenceId: "xua_reference_id",
  paymentKind: "xua_payment_kind",
  signature: "xua_context_sig",
} as const;

export type WebhookContextQueryParams = Record<
  (typeof WEBHOOK_CONTEXT_QUERY_PARAMS)[keyof typeof WEBHOOK_CONTEXT_QUERY_PARAMS],
  string
>;

export function normalizeWebhookPaymentKind(kind: string | null | undefined): PaymentKindValue | null {
  switch (kind?.trim().toUpperCase()) {
    case PaymentKind.ORDER:
      return PaymentKind.ORDER;
    case PaymentKind.SUBSCRIPTION:
      return PaymentKind.SUBSCRIPTION;
    case PaymentKind.DEPOSIT:
      return PaymentKind.DEPOSIT;
    default:
      return null;
  }
}

export function requireWebhookPaymentKind(kind: string | null | undefined): PaymentKindValue {
  const normalized = normalizeWebhookPaymentKind(kind);
  if (!normalized) {
    throw new Error("PAYMENT_KIND_INVALID");
  }
  return normalized;
}

export function getWebhookContextSecret(): string | null {
  return process.env.PAYMENT_WEBHOOK_CONTEXT_SECRET
    ?? process.env.MERCADOPAGO_WEBHOOK_SECRET
    ?? process.env.PAYMENT_WEBHOOK_SECRET
    ?? process.env.INTERNAL_SECRET
    ?? null;
}

function contextManifest(referenceId: string, paymentKind: PaymentKindValue): string {
  return `reference_id:${referenceId};payment_kind:${paymentKind};`;
}

function safeEqualHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function signWebhookContext(
  referenceId: string,
  paymentKind: PaymentKindValue,
  secret = getWebhookContextSecret()
): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(contextManifest(referenceId, paymentKind))
    .digest("hex");
}

export function verifyWebhookContextSignature(
  referenceId: string,
  paymentKind: PaymentKindValue,
  signature: string,
  secret = getWebhookContextSecret()
): boolean {
  const expected = signWebhookContext(referenceId, paymentKind, secret);
  return Boolean(expected && safeEqualHex(signature, expected));
}

export function buildWebhookContextQueryParams(
  referenceId: string,
  paymentKind: PaymentKindValue
): WebhookContextQueryParams | null {
  const signature = signWebhookContext(referenceId, paymentKind);
  if (!signature) return null;

  return {
    [WEBHOOK_CONTEXT_QUERY_PARAMS.referenceId]: referenceId,
    [WEBHOOK_CONTEXT_QUERY_PARAMS.paymentKind]: paymentKind,
    [WEBHOOK_CONTEXT_QUERY_PARAMS.signature]: signature,
  };
}
