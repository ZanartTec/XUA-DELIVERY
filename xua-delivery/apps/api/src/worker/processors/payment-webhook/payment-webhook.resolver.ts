import type { Payment, Prisma } from "@prisma/client";
import { PaymentKind } from "@xua/shared/enums";
import {
  PAYMENT_PROVIDERS,
  type ProviderPaymentDetails,
} from "../../../modules/payments/gateway/payments.gateway.js";
import type { PaymentTarget, PaymentTargetKind, WebhookPaymentContext } from "./payment-webhook.types.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TARGET_REFERENCE_FINDERS: Record<
  PaymentTargetKind,
  (tx: Prisma.TransactionClient, references: string[]) => Promise<PaymentTarget | null>
> = {
  [PaymentKind.ORDER]: async (tx, references) => {
    const order = await tx.order.findFirst({
      where: { id: { in: references } },
      select: { id: true },
    });
    return order ? { kind: PaymentKind.ORDER, id: order.id } : null;
  },
  [PaymentKind.SUBSCRIPTION]: async (tx, references) => {
    const subscription = await tx.userSubscription.findFirst({
      where: { id: { in: references } },
      select: { id: true },
    });
    return subscription ? { kind: PaymentKind.SUBSCRIPTION, id: subscription.id } : null;
  },
};

const FALLBACK_TARGET_ORDER: readonly PaymentTargetKind[] = [
  PaymentKind.ORDER,
  PaymentKind.SUBSCRIPTION,
];

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function uniqueReferences(references: string[]): string[] {
  return Array.from(new Set(references));
}

function isSupportedTargetKind(kind: PaymentKind | null): kind is PaymentTargetKind {
  return kind === PaymentKind.ORDER || kind === PaymentKind.SUBSCRIPTION;
}

function paymentKindFromProvider(kind: string | null | undefined): PaymentKind | null {
  switch (kind?.toUpperCase()) {
    case PaymentKind.ORDER:
      return PaymentKind.ORDER;
    case PaymentKind.SUBSCRIPTION:
      return PaymentKind.SUBSCRIPTION;
    default:
      return null;
  }
}

function getProviderUuidReferences(providerPayment: ProviderPaymentDetails): string[] {
  return [providerPayment.orderReference, providerPayment.externalReference].filter(isUuid);
}

function getContextUuidReferences(
  providerPayment: ProviderPaymentDetails,
  context?: WebhookPaymentContext
): string[] {
  const providerKind = paymentKindFromProvider(providerPayment.paymentKind);
  const contextKind = paymentKindFromProvider(context?.paymentKind);
  if (!contextKind || (providerKind && providerKind !== contextKind)) return [];
  return isUuid(context?.referenceId) ? [context.referenceId] : [];
}

function getUuidReferences(
  providerPayment: ProviderPaymentDetails,
  context?: WebhookPaymentContext
): string[] {
  return uniqueReferences([
    ...getProviderUuidReferences(providerPayment),
    ...getContextUuidReferences(providerPayment, context),
  ]);
}

async function findTargetByKind(
  tx: Prisma.TransactionClient,
  kind: PaymentTargetKind,
  references: string[]
): Promise<PaymentTarget | null> {
  if (references.length === 0) return null;
  return TARGET_REFERENCE_FINDERS[kind](tx, references);
}

async function findTargetByFallbackOrder(
  tx: Prisma.TransactionClient,
  references: string[]
): Promise<PaymentTarget | null> {
  if (references.length === 0) return null;

  for (const kind of FALLBACK_TARGET_ORDER) {
    const target = await findTargetByKind(tx, kind, references);
    if (target) return target;
  }

  return null;
}

export function getResourceId(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as Record<string, unknown>;
  const { data } = body;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { id } = data as Record<string, unknown>;
  return id == null ? null : String(id);
}

export function getWebhookPaymentContext(payload: Prisma.JsonValue): WebhookPaymentContext {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const body = payload as Record<string, unknown>;
  const context = body.xua_context;
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  const { reference_id: referenceId, payment_kind: paymentKind } = context as Record<string, unknown>;

  return {
    referenceId: typeof referenceId === "string" ? referenceId : undefined,
    paymentKind: typeof paymentKind === "string" ? paymentKind : undefined,
  };
}

export async function findExistingPayment(
  tx: Prisma.TransactionClient,
  providerPayment: ProviderPaymentDetails,
  context?: WebhookPaymentContext
): Promise<Payment | null> {
  const referenceIds = [
    providerPayment.providerPaymentId,
    providerPayment.externalReference,
    providerPayment.orderReference,
  ].filter((value): value is string => Boolean(value));
  const uuidReferences = getUuidReferences(providerPayment, context);

  return tx.payment.findFirst({
    where: {
      provider: PAYMENT_PROVIDERS.mercadoPago,
      OR: [
        { provider_payment_ref: { in: referenceIds } },
        { external_id: { in: referenceIds } },
        ...(uuidReferences.length > 0
          ? [
              { order_id: { in: uuidReferences } },
              { user_subscription_id: { in: uuidReferences } },
            ]
          : []),
      ],
    },
    orderBy: { created_at: "desc" },
  });
}

export async function resolvePaymentTarget(
  tx: Prisma.TransactionClient,
  providerPayment: ProviderPaymentDetails,
  existing: Payment | null,
  context?: WebhookPaymentContext
): Promise<PaymentTarget | null> {
  if (existing?.order_id) return { kind: PaymentKind.ORDER, id: existing.order_id };
  if (existing?.user_subscription_id) {
    return { kind: PaymentKind.SUBSCRIPTION, id: existing.user_subscription_id };
  }

  const providerReferences = getProviderUuidReferences(providerPayment);
  const contextReferences = getContextUuidReferences(providerPayment, context);
  const references = uniqueReferences([...providerReferences, ...contextReferences]);
  const providerKind = paymentKindFromProvider(providerPayment.paymentKind);
  const contextKind = paymentKindFromProvider(context?.paymentKind);
  const kindHint = providerKind ?? contextKind;

  if (isSupportedTargetKind(kindHint)) {
    return findTargetByKind(tx, kindHint, references);
  }

  return findTargetByFallbackOrder(tx, providerReferences);
}
