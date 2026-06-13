import type {
  IPaymentGateway,
  PaymentChargeMetadata,
  PaymentResult,
  ProviderPaymentDetails,
  RefundResult,
} from "../gateway/payments.gateway.js";
import type { CheckoutPaymentMethod } from "@xua/shared/enums";
import {
  buildWebhookContextQueryParams,
  requireWebhookPaymentKind,
} from "../utils/webhook-context.js";

const DEFAULT_MERCADO_PAGO_API_BASE = "https://api.mercadopago.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_STATEMENT_DESCRIPTOR = "XUA DELIVERY";

interface MercadoPagoPreferenceResponse {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
  status?: string;
}

interface MercadoPagoPaymentResponse {
  id: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string;
  metadata?: {
    order_id?: string;
    payment_method?: CheckoutPaymentMethod;
    kind?: string;
  };
}

function extractOrderReference(payment: MercadoPagoPaymentResponse): string | undefined {
  return payment.metadata?.order_id ?? payment.external_reference;
}

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não definido");
  }
  return token;
}

function getApiBaseUrl(): string {
  return (process.env.MERCADOPAGO_API_BASE_URL ?? DEFAULT_MERCADO_PAGO_API_BASE).replace(/\/$/, "");
}

function getRequestTimeoutMs(): number {
  const parsed = Number(process.env.MERCADOPAGO_REQUEST_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

function getStatementDescriptor(): string {
  return process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR ?? DEFAULT_STATEMENT_DESCRIPTOR;
}

function centsToAmount(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function withQueryParams(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "0.0.0.0"
    || normalized === "::1";
}

function shouldEnableAutoReturn(successBackUrl: string): boolean {
  try {
    const parsed = new URL(successBackUrl);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && !isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function getBackUrl(
  envName: string,
  legacyEnvName: string,
  status: "success" | "failure" | "pending",
  orderId: string,
  kind?: string
): string {
  const isSubscription = kind?.toUpperCase() === "SUBSCRIPTION";
  const explicit = isSubscription
    ? process.env[`MERCADOPAGO_SUBSCRIPTION_BACK_URL_${status.toUpperCase()}`]
    : process.env[envName] ?? process.env[legacyEnvName];

  if (explicit) {
    return withQueryParams(explicit, {
      [isSubscription ? "subscriptionId" : "orderId"]: orderId,
      paymentStatus: status,
    });
  }

  const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
  return withQueryParams(
    `${origin}${isSubscription ? "/subscription/manage" : "/checkout/confirmation"}`,
    {
      [isSubscription ? "subscriptionId" : "orderId"]: orderId,
      paymentStatus: status,
    }
  );
}

function assertPaymentReference(referenceId: string | null | undefined): string {
  const normalized = referenceId?.trim();
  if (!normalized) {
    throw new Error("PAYMENT_REFERENCE_REQUIRED");
  }
  return normalized;
}

function getNotificationUrl(metadata?: PaymentChargeMetadata): string | undefined {
  const url = process.env.MERCADOPAGO_NOTIFICATION_URL 
    || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "")}/api/payments/webhook` : undefined);
  if (!url) return undefined;
  const source = process.env.MERCADOPAGO_NOTIFICATION_SOURCE ?? "webhooks";
  const params: Record<string, string> = url.includes("source_news=")
    ? {}
    : { source_news: source };

  if (metadata?.orderId && metadata.kind) {
    const contextParams = buildWebhookContextQueryParams(
      metadata.orderId,
      requireWebhookPaymentKind(metadata.kind)
    );
    if (contextParams) Object.assign(params, contextParams);
  }

  return withQueryParams(url, params);
}

function sanitizePreferenceResponse(preference: MercadoPagoPreferenceResponse): Record<string, unknown> {
  return {
    id: preference.id,
    status: preference.status,
    hasInitPoint: Boolean(preference.init_point),
    hasSandboxInitPoint: Boolean(preference.sandbox_init_point),
  };
}

function sanitizePaymentResponse(payment: MercadoPagoPaymentResponse): Record<string, unknown> {
  return {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    external_reference: payment.external_reference,
    order_reference: extractOrderReference(payment),
    payment_method: payment.metadata?.payment_method,
    kind: payment.metadata?.kind,
    transaction_amount: payment.transaction_amount,
    date_approved: payment.date_approved,
  };
}

function normalizeErrorBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return typeof body === "string" ? body : "Resposta inválida do Mercado Pago";
  }

  const { message, error, status, cause } = body as Record<string, unknown>;
  return JSON.stringify({ message, error, status, cause });
}

function parseResponseBody(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function mercadoPagoRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(getRequestTimeoutMs()),
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = parseResponseBody(text);

  if (!response.ok) {
    throw new Error(
      `Mercado Pago API error ${response.status}: ${normalizeErrorBody(body)}`
    );
  }

  return body as T;
}

export class MercadoPagoAdapter implements IPaymentGateway {
  async charge(
    amountCents: number,
    metadata: PaymentChargeMetadata
  ): Promise<PaymentResult> {
    const referenceId = assertPaymentReference(metadata.orderId);
    const paymentKind = requireWebhookPaymentKind(metadata.kind);
    const isSubscription = paymentKind === "SUBSCRIPTION";
    const description =
      metadata.description
      ?? `${isSubscription ? "Assinatura Xuá" : "Pedido Xuá"} #${referenceId.slice(0, 8)}`;
    const items = metadata.items?.length
      ? metadata.items.map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          currency_id: "BRL",
          unit_price: centsToAmount(item.unitPriceCents),
        }))
      : [
          {
            id: referenceId,
            title: description,
            quantity: 1,
            currency_id: "BRL",
            unit_price: centsToAmount(amountCents),
          },
        ];

    const backUrls = {
      success: getBackUrl(
        "MERCADOPAGO_BACK_URL_SUCCESS",
        "MERCADOPAGO_SUCCESS_URL",
        "success",
        referenceId,
        paymentKind
      ),
      failure: getBackUrl(
        "MERCADOPAGO_BACK_URL_FAILURE",
        "MERCADOPAGO_FAILURE_URL",
        "failure",
        referenceId,
        paymentKind
      ),
      pending: getBackUrl(
        "MERCADOPAGO_BACK_URL_PENDING",
        "MERCADOPAGO_PENDING_URL",
        "pending",
        referenceId,
        paymentKind
      ),
    };
    const autoReturn = shouldEnableAutoReturn(backUrls.success) ? "approved" : undefined;

    const preference = await mercadoPagoRequest<MercadoPagoPreferenceResponse>(
      "/checkout/preferences",
      {
        method: "POST",
        headers: metadata.idempotencyKey
          ? { "X-Idempotency-Key": metadata.idempotencyKey }
          : undefined,
        body: JSON.stringify({
          items,
          external_reference: referenceId,
          notification_url: getNotificationUrl({ ...metadata, orderId: referenceId, kind: paymentKind }),
          back_urls: backUrls,
          ...(autoReturn ? { auto_return: autoReturn } : {}),
          statement_descriptor: getStatementDescriptor(),
          payer: metadata.payerEmail ? { email: metadata.payerEmail } : undefined,
          metadata: {
            order_id: referenceId,
            payment_method: metadata.paymentMethod,
            kind: paymentKind,
          },
        }),
      }
    );

    return {
      externalId: preference.id,
      providerPaymentRef: preference.id,
      status: preference.status === "approved" ? "captured" : "created",
      redirectUrl: preference.init_point ?? preference.sandbox_init_point,
      raw: sanitizePreferenceResponse(preference),
    };
  }

  async refund(externalId: string): Promise<RefundResult> {
    const refund = await mercadoPagoRequest<{ id: string; status?: string }>(
      `/v1/payments/${externalId}/refunds`,
      { method: "POST" }
    );

    return {
      externalId: String(refund.id ?? externalId),
      status: refund.status === "approved" ? "refunded" : "failed",
      raw: refund,
    };
  }

  async getPayment(externalId: string): Promise<ProviderPaymentDetails> {
    const payment = await mercadoPagoRequest<MercadoPagoPaymentResponse>(
      `/v1/payments/${externalId}`
    );

    return {
      providerPaymentId: String(payment.id),
      status: payment.status ?? "unknown",
      statusDetail: payment.status_detail,
      externalReference: payment.external_reference,
      orderReference: extractOrderReference(payment),
      paymentKind: payment.metadata?.kind,
      paymentMethod: payment.metadata?.payment_method,
      amountCents: Math.round(Number(payment.transaction_amount ?? 0) * 100),
      paidAt: payment.date_approved ? new Date(payment.date_approved) : undefined,
      raw: sanitizePaymentResponse(payment),
    };
  }
}
