import { describe, expect, it } from "vitest";
import { PaymentStatus } from "@xua/shared/enums";
import {
  formatAddressLine,
  formatCents,
  formatDateOnly,
  formatDocument,
  formatPaymentLine,
  formatReceiptNumber,
} from "@api/modules/orders/receipt-pdf/receipt-format.js";

describe("formatPaymentLine", () => {
  it("online capturado sai PAGO com o metodo", () => {
    expect(formatPaymentLine("pix", PaymentStatus.CAPTURED, null)).toBe("PAGO – PIX");
    expect(formatPaymentLine("credit", PaymentStatus.CAPTURED, null)).toBe("PAGO – CARTÃO DE CRÉDITO");
  });

  it("dinheiro a receber mostra o troco quando informado", () => {
    expect(formatPaymentLine("cash", PaymentStatus.CREATED, 10000)).toBe(
      "A RECEBER – DINHEIRO (troco p/ R$ 100,00)"
    );
    expect(formatPaymentLine("cash", PaymentStatus.CREATED, null)).toBe("A RECEBER – DINHEIRO");
    expect(formatPaymentLine("cash", PaymentStatus.CREATED, 0)).toBe("A RECEBER – DINHEIRO");
  });

  it("pagamento na entrega ja capturado (2a via apos a entrega) sai PAGO", () => {
    expect(formatPaymentLine("cash", PaymentStatus.CAPTURED, 10000)).toBe("PAGO – DINHEIRO");
    expect(formatPaymentLine("card_on_delivery", PaymentStatus.CAPTURED, null)).toBe("PAGO – CARTÃO");
  });

  it("cartao na entrega a receber", () => {
    expect(formatPaymentLine("card_on_delivery", PaymentStatus.CREATED, null)).toBe(
      "A RECEBER – CARTÃO NA ENTREGA"
    );
  });

  it("online nao capturado e estornado", () => {
    expect(formatPaymentLine("pix", PaymentStatus.CREATED, null)).toBe("AGUARDANDO PAGAMENTO – PIX");
    expect(formatPaymentLine("credit", PaymentStatus.REFUNDED, null)).toBe("ESTORNADO – CARTÃO DE CRÉDITO");
  });

  it("sem metodo registrado sai A RECEBER", () => {
    expect(formatPaymentLine(null, null, null)).toBe("A RECEBER");
  });

  it("pagamento legado sem metodo mas capturado/estornado nao sai como A RECEBER", () => {
    expect(formatPaymentLine(null, PaymentStatus.CAPTURED, null)).toBe("PAGO");
    expect(formatPaymentLine(null, PaymentStatus.REFUNDED, null)).toBe("ESTORNADO");
  });
});

describe("formatadores do comprovante", () => {
  it("numero com 6 digitos", () => {
    expect(formatReceiptNumber(123)).toBe("000123");
    expect(formatReceiptNumber(1234567)).toBe("1234567");
  });

  it("valores em reais sem NBSP", () => {
    expect(formatCents(123456)).toBe("R$ 1.234,56");
  });

  it("CPF, CNPJ e documento fora do padrao", () => {
    expect(formatDocument("12345678909")).toBe("123.456.789-09");
    expect(formatDocument("12345678000190")).toBe("12.345.678/0001-90");
    expect(formatDocument("ABC")).toBe("ABC");
    expect(formatDocument(null)).toBeNull();
  });

  it("endereco completo e endereco vazio", () => {
    expect(
      formatAddressLine({
        street: "Rua A",
        number: "10",
        complement: null,
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        zip_code: "01001000",
      })
    ).toBe("Rua A, 10 - Centro - São Paulo/SP - CEP 01001-000");
    expect(
      formatAddressLine({
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        zip_code: null,
      })
    ).toBeNull();
  });

  it("data de entrega (coluna DATE) nao volta um dia pelo fuso", () => {
    expect(formatDateOnly("2026-10-30T00:00:00.000Z")).toBe("30/10/2026");
  });
});
