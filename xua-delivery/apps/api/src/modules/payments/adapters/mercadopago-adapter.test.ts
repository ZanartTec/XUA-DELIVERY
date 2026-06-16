import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentKind } from "@xua/shared/enums";
import { MercadoPagoAdapter } from "./mercadopago-adapter.js";
import { verifyWebhookContextSignature } from "../utils/webhook-context.js";

const ENV_KEYS = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_NOTIFICATION_URL",
  "MERCADOPAGO_NOTIFICATION_SOURCE",
  "MERCADOPAGO_BACK_URL_SUCCESS",
  "MERCADOPAGO_BACK_URL_FAILURE",
  "MERCADOPAGO_BACK_URL_PENDING",
  "PAYMENT_WEBHOOK_CONTEXT_SECRET",
] as const;

const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236901";

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "test-token";
  process.env.MERCADOPAGO_NOTIFICATION_URL = "https://api.xua.test/api/payments/webhook";
  process.env.MERCADOPAGO_NOTIFICATION_SOURCE = "webhooks";
  process.env.MERCADOPAGO_BACK_URL_SUCCESS = "https://web.xua.test/checkout/confirmation";
  process.env.MERCADOPAGO_BACK_URL_FAILURE = "https://web.xua.test/checkout/confirmation";
  process.env.MERCADOPAGO_BACK_URL_PENDING = "https://web.xua.test/checkout/confirmation";
  process.env.PAYMENT_WEBHOOK_CONTEXT_SECRET = "context-secret-test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv();
});

describe("MercadoPagoAdapter", () => {
  it("envia referencia local no payload e na notification_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pref-123",
          init_point: "https://mercadopago.test/checkout/pref-123",
          status: "active",
        }),
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await new MercadoPagoAdapter({ accessToken: "TEST-token" }).charge(5000, {
      orderId,
      kind: PaymentKind.ORDER,
      idempotencyKey: `mp-checkout-pro:${orderId}:pix`,
      paymentMethod: "pix",
      payerEmail: "cliente@xua.test",
    });

    const [, options] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((options as RequestInit).body));
    const notificationUrl = new URL(body.notification_url);

    expect(body.external_reference).toBe(orderId);
    expect(body.auto_return).toBe("approved");
    expect(body.metadata).toEqual({
      order_id: orderId,
      payment_method: "pix",
      kind: PaymentKind.ORDER,
    });
    expect(notificationUrl.searchParams.get("source_news")).toBe("webhooks");
    expect(notificationUrl.searchParams.get("xua_reference_id")).toBe(orderId);
    expect(notificationUrl.searchParams.get("xua_payment_kind")).toBe(PaymentKind.ORDER);
    expect(verifyWebhookContextSignature(
      orderId,
      PaymentKind.ORDER,
      notificationUrl.searchParams.get("xua_context_sig") ?? ""
    )).toBe(true);
  });

  it("omite auto_return quando a URL de sucesso aponta para localhost", async () => {
    process.env.MERCADOPAGO_BACK_URL_SUCCESS = "http://localhost:3001/checkout/confirmation";
    process.env.MERCADOPAGO_BACK_URL_FAILURE = "http://localhost:3001/checkout/confirmation";
    process.env.MERCADOPAGO_BACK_URL_PENDING = "http://localhost:3001/checkout/confirmation";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pref-123",
          init_point: "https://mercadopago.test/checkout/pref-123",
          status: "active",
        }),
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await new MercadoPagoAdapter({ accessToken: "TEST-token" }).charge(5000, {
      orderId,
      kind: PaymentKind.ORDER,
      paymentMethod: "credit",
      payerEmail: "cliente@xua.test",
    });

    const [, options] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((options as RequestInit).body));

    expect(body.back_urls.success).toContain("http://localhost:3001/checkout/confirmation");
    expect(body.auto_return).toBeUndefined();
  });
});
