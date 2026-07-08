import { describe, expect, it } from "vitest";
import { PaymentKind } from "@xua/shared/enums";
import { normalizeWebhookPaymentKind, requireWebhookPaymentKind } from "./webhook-context.js";

describe("normalizeWebhookPaymentKind", () => {
  it("aceita os kinds suportados, normalizando caixa e espaços", () => {
    expect(normalizeWebhookPaymentKind("order")).toBe(PaymentKind.ORDER);
    expect(normalizeWebhookPaymentKind(" SUBSCRIPTION ")).toBe(PaymentKind.SUBSCRIPTION);
  });

  it("rejeita DEPOSIT — caução financeira v1 removida, kind não é mais roteável", () => {
    expect(normalizeWebhookPaymentKind("DEPOSIT")).toBeNull();
    expect(normalizeWebhookPaymentKind("deposit")).toBeNull();
  });

  it("rejeita valores desconhecidos, vazios e ausentes", () => {
    expect(normalizeWebhookPaymentKind("PIX")).toBeNull();
    expect(normalizeWebhookPaymentKind("")).toBeNull();
    expect(normalizeWebhookPaymentKind(null)).toBeNull();
    expect(normalizeWebhookPaymentKind(undefined)).toBeNull();
  });
});

describe("requireWebhookPaymentKind", () => {
  it("lança PAYMENT_KIND_INVALID para o kind legado DEPOSIT", () => {
    expect(() => requireWebhookPaymentKind("DEPOSIT")).toThrowError("PAYMENT_KIND_INVALID");
  });
});
