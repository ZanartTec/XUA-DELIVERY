import { describe, expect, it } from "vitest";
import { PaymentStatus } from "@xua/shared/enums";
import type { ProviderPaymentDetails } from "../../../modules/payments/gateway/payments.gateway.js";
import {
  assertPaymentAmountMatches,
  auditEventForPaymentStatus,
  isInvalidRegression,
  paymentStatusToOrderPaymentStatus,
} from "./payment-webhook.status.js";
import { NonRetryablePaymentWebhookError } from "./payment-webhook.types.js";

function providerPayment(overrides: Partial<ProviderPaymentDetails> = {}): ProviderPaymentDetails {
  return {
    providerPaymentId: "mp-1",
    status: "approved",
    amountCents: 5000,
    raw: {},
    ...overrides,
  };
}

describe("paymentStatusToOrderPaymentStatus", () => {
  it("mapeia todos os status de pagamento para um status de pedido conhecido", () => {
    expect(paymentStatusToOrderPaymentStatus(PaymentStatus.CAPTURED)).toBe("paid");
    expect(paymentStatusToOrderPaymentStatus(PaymentStatus.FAILED)).toBe("failed");
    expect(paymentStatusToOrderPaymentStatus(PaymentStatus.REFUNDED)).toBe("refunded");
    expect(paymentStatusToOrderPaymentStatus(PaymentStatus.AUTHORIZED)).toBe("pending");
    expect(paymentStatusToOrderPaymentStatus(PaymentStatus.CREATED)).toBe("pending");
    expect(paymentStatusToOrderPaymentStatus(PaymentStatus.EXPIRED)).toBe("expired");
  });
});

describe("auditEventForPaymentStatus", () => {
  it("cada status de pagamento tem um evento de auditoria associado", () => {
    for (const status of Object.values(PaymentStatus)) {
      expect(auditEventForPaymentStatus(status)).toBeDefined();
    }
  });
});

describe("isInvalidRegression", () => {
  it("bloqueia REFUNDED voltando para qualquer status anterior", () => {
    expect(isInvalidRegression(PaymentStatus.REFUNDED, PaymentStatus.CAPTURED)).toBe(true);
    expect(isInvalidRegression(PaymentStatus.REFUNDED, PaymentStatus.CREATED)).toBe(true);
    expect(isInvalidRegression(PaymentStatus.REFUNDED, PaymentStatus.FAILED)).toBe(true);
  });

  it("bloqueia CAPTURED voltando para CREATED", () => {
    expect(isInvalidRegression(PaymentStatus.CAPTURED, PaymentStatus.CREATED)).toBe(true);
  });

  it("permite avanço normal (CREATED -> AUTHORIZED -> CAPTURED)", () => {
    expect(isInvalidRegression(PaymentStatus.CREATED, PaymentStatus.AUTHORIZED)).toBe(false);
    expect(isInvalidRegression(PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED)).toBe(false);
  });

  it("permite reenvio idempotente do mesmo status (webhook duplicado)", () => {
    expect(isInvalidRegression(PaymentStatus.CAPTURED, PaymentStatus.CAPTURED)).toBe(false);
  });

  it("status sem regressões configuradas nunca é considerado inválido", () => {
    expect(isInvalidRegression(PaymentStatus.CREATED, PaymentStatus.FAILED)).toBe(false);
  });
});

describe("assertPaymentAmountMatches", () => {
  it("não valida valor para status que não exige exatidão (ex.: FAILED)", () => {
    expect(() =>
      assertPaymentAmountMatches(5000, providerPayment({ amountCents: 1 }), PaymentStatus.FAILED)
    ).not.toThrow();
  });

  it("rejeita quando o provedor não informa amountCents válido para CAPTURED", () => {
    expect(() =>
      assertPaymentAmountMatches(
        5000,
        providerPayment({ amountCents: 0 }),
        PaymentStatus.CAPTURED
      )
    ).toThrow(NonRetryablePaymentWebhookError);
  });

  it("rejeita quando o valor do provedor diverge do esperado (possível fraude/erro)", () => {
    expect(() =>
      assertPaymentAmountMatches(
        5000,
        providerPayment({ amountCents: 4999 }),
        PaymentStatus.CAPTURED
      )
    ).toThrow(/PAYMENT_AMOUNT_MISMATCH/);
  });

  it("aceita quando o valor bate exatamente", () => {
    expect(() =>
      assertPaymentAmountMatches(
        5000,
        providerPayment({ amountCents: 5000 }),
        PaymentStatus.CAPTURED
      )
    ).not.toThrow();
  });

  it("não valida contra expectedAmountCents ainda desconhecido (0)", () => {
    expect(() =>
      assertPaymentAmountMatches(
        0,
        providerPayment({ amountCents: 5000 }),
        PaymentStatus.AUTHORIZED
      )
    ).not.toThrow();
  });
});
