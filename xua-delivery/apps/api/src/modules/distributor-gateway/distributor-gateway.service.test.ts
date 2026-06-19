import { describe, expect, it } from "vitest";
import type { DistributorPaymentMethodsPublic } from "@xua/shared/schemas/distributor-payment-settings";
import { DEFAULT_PUBLIC_PAYMENT_METHODS, isPaymentMethodAllowed } from "./distributor-gateway.service.js";

function settings(overrides: Partial<DistributorPaymentMethodsPublic> = {}): DistributorPaymentMethodsPublic {
  return { ...DEFAULT_PUBLIC_PAYMENT_METHODS, ...overrides };
}

describe("isPaymentMethodAllowed", () => {
  it("nega dinheiro quando a distribuidora desabilitou accepts_cash_on_delivery", () => {
    expect(isPaymentMethodAllowed("cash", settings({ accepts_cash_on_delivery: false }))).toBe(false);
  });

  it("permite dinheiro quando a distribuidora aceita", () => {
    expect(isPaymentMethodAllowed("cash", settings({ accepts_cash_on_delivery: true }))).toBe(true);
  });

  it("nega cartão na entrega quando desabilitado", () => {
    expect(isPaymentMethodAllowed("card_on_delivery", settings({ accepts_card_on_delivery: false }))).toBe(false);
  });

  it("permite cartão na entrega quando habilitado", () => {
    expect(isPaymentMethodAllowed("card_on_delivery", settings({ accepts_card_on_delivery: true }))).toBe(true);
  });

  it("nega pix sem gateway Mercado Pago conectado, mesmo com accepts_pix_online true", () => {
    expect(
      isPaymentMethodAllowed("pix", settings({ accepts_pix_online: true, mp_connected: false }))
    ).toBe(false);
  });

  it("nega pix com gateway conectado mas accepts_pix_online false", () => {
    expect(
      isPaymentMethodAllowed("pix", settings({ accepts_pix_online: false, mp_connected: true }))
    ).toBe(false);
  });

  it("permite pix com gateway conectado e accepts_pix_online true", () => {
    expect(
      isPaymentMethodAllowed("pix", settings({ accepts_pix_online: true, mp_connected: true }))
    ).toBe(true);
  });

  it("nega crédito sem gateway conectado", () => {
    expect(
      isPaymentMethodAllowed("credit", settings({ accepts_credit_online: true, mp_connected: false }))
    ).toBe(false);
  });

  it("permite crédito com gateway conectado e accepts_credit_online true", () => {
    expect(
      isPaymentMethodAllowed("credit", settings({ accepts_credit_online: true, mp_connected: true }))
    ).toBe(true);
  });

  it("default de distribuidora sem config aceita só dinheiro", () => {
    expect(isPaymentMethodAllowed("cash", DEFAULT_PUBLIC_PAYMENT_METHODS)).toBe(true);
    expect(isPaymentMethodAllowed("pix", DEFAULT_PUBLIC_PAYMENT_METHODS)).toBe(false);
    expect(isPaymentMethodAllowed("credit", DEFAULT_PUBLIC_PAYMENT_METHODS)).toBe(false);
    expect(isPaymentMethodAllowed("card_on_delivery", DEFAULT_PUBLIC_PAYMENT_METHODS)).toBe(false);
  });
});
