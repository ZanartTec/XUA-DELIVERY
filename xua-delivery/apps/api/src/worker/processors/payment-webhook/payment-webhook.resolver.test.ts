import { describe, expect, it, vi } from "vitest";
import { PaymentKind } from "@xua/shared/enums";
import type { ProviderPaymentDetails } from "../../../modules/payments/gateway/payments.gateway.js";
import {
  findExistingPayment,
  getResourceId,
  getWebhookPaymentContext,
  resolvePaymentTarget,
} from "./payment-webhook.resolver.js";

const ORDER_ID = "7e1d7b55-3f52-4d10-aac3-74387c236401";
const SUBSCRIPTION_ID = "7e1d7b55-3f52-4d10-aac3-74387c236402";

function txMock() {
  return {
    order: { findFirst: vi.fn() },
    userSubscription: { findFirst: vi.fn() },
    payment: { findFirst: vi.fn() },
  } as any;
}

function providerPayment(overrides: Partial<ProviderPaymentDetails> = {}): ProviderPaymentDetails {
  return {
    providerPaymentId: "mp-1",
    status: "approved",
    amountCents: 5000,
    raw: {},
    ...overrides,
  };
}

describe("getResourceId", () => {
  it("extrai data.id do payload do webhook", () => {
    expect(getResourceId({ data: { id: "123" } })).toBe("123");
    expect(getResourceId({ data: { id: 123 } })).toBe("123");
  });

  it("retorna null para payload sem data.id", () => {
    expect(getResourceId({})).toBeNull();
    expect(getResourceId(null)).toBeNull();
    expect(getResourceId({ data: null })).toBeNull();
    expect(getResourceId("string" as never)).toBeNull();
    expect(getResourceId([1, 2] as never)).toBeNull();
  });
});

describe("getWebhookPaymentContext", () => {
  it("extrai reference_id e payment_kind de xua_context", () => {
    const context = getWebhookPaymentContext({
      xua_context: { reference_id: ORDER_ID, payment_kind: "ORDER" },
    });
    expect(context).toEqual({ referenceId: ORDER_ID, paymentKind: "ORDER" });
  });

  it("retorna objeto vazio quando não há xua_context", () => {
    expect(getWebhookPaymentContext({})).toEqual({});
    expect(getWebhookPaymentContext(null)).toEqual({});
  });

  it("ignora campos com tipo inesperado", () => {
    const context = getWebhookPaymentContext({
      xua_context: { reference_id: 123, payment_kind: null },
    });
    expect(context).toEqual({ referenceId: undefined, paymentKind: undefined });
  });
});

describe("findExistingPayment", () => {
  it("busca por provider_payment_ref, external_id e referências UUID do contexto", async () => {
    const tx = txMock();
    tx.payment.findFirst.mockResolvedValue({ id: "payment-1" });

    const result = await findExistingPayment(
      tx,
      providerPayment({ providerPaymentId: "mp-1", externalReference: ORDER_ID }),
      { referenceId: ORDER_ID, paymentKind: "ORDER" }
    );

    expect(result).toEqual({ id: "payment-1" });
    expect(tx.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ order_id: { in: [ORDER_ID] } }),
          ]),
        }),
      })
    );
  });

  it("retorna null quando nenhum pagamento existente casa", async () => {
    const tx = txMock();
    tx.payment.findFirst.mockResolvedValue(null);

    const result = await findExistingPayment(tx, providerPayment());
    expect(result).toBeNull();
  });
});

describe("resolvePaymentTarget", () => {
  it("usa order_id do pagamento existente quando presente (idempotência)", async () => {
    const tx = txMock();
    const target = await resolvePaymentTarget(
      tx,
      providerPayment(),
      { order_id: ORDER_ID, user_subscription_id: null } as any
    );
    expect(target).toEqual({ kind: PaymentKind.ORDER, id: ORDER_ID });
    expect(tx.order.findFirst).not.toHaveBeenCalled();
  });

  it("usa user_subscription_id do pagamento existente quando não há order_id", async () => {
    const tx = txMock();
    const target = await resolvePaymentTarget(
      tx,
      providerPayment(),
      { order_id: null, user_subscription_id: SUBSCRIPTION_ID } as any
    );
    expect(target).toEqual({ kind: PaymentKind.SUBSCRIPTION, id: SUBSCRIPTION_ID });
  });

  it("sem pagamento existente, resolve pelo paymentKind + referência do provedor", async () => {
    const tx = txMock();
    tx.order.findFirst.mockResolvedValue({ id: ORDER_ID });

    const target = await resolvePaymentTarget(
      tx,
      providerPayment({ orderReference: ORDER_ID, paymentKind: "ORDER" }),
      null
    );

    expect(target).toEqual({ kind: PaymentKind.ORDER, id: ORDER_ID });
  });

  it("sem hint de kind, cai no fallback e tenta ORDER antes de SUBSCRIPTION", async () => {
    const tx = txMock();
    tx.order.findFirst.mockResolvedValue(null);
    tx.userSubscription.findFirst.mockResolvedValue({ id: SUBSCRIPTION_ID });

    const target = await resolvePaymentTarget(
      tx,
      providerPayment({ orderReference: SUBSCRIPTION_ID }),
      null
    );

    expect(tx.order.findFirst).toHaveBeenCalled();
    expect(target).toEqual({ kind: PaymentKind.SUBSCRIPTION, id: SUBSCRIPTION_ID });
  });

  it("sem nenhuma referência utilizável, retorna null", async () => {
    const tx = txMock();
    const target = await resolvePaymentTarget(tx, providerPayment(), null);
    expect(target).toBeNull();
    expect(tx.order.findFirst).not.toHaveBeenCalled();
  });
});
