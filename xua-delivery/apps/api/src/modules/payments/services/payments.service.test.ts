import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventType, PaymentStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  gateway: { refund: vi.fn() },
  auditRepository: { emit: vi.fn() },
  distributorGatewayService: { getDecryptedCredentials: vi.fn() },
  schedulePaymentExpiration: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  tx: {
    payment: { update: vi.fn() },
    paymentTransaction: { create: vi.fn() },
  },
  prisma: {
    payment: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("../gateway/payments.gateway.js", () => ({
  PAYMENT_PROVIDERS: { mercadoPago: "mercadopago" },
  getConfiguredPaymentProvider: () => "mercadopago",
  getPaymentGateway: () => mocks.gateway,
  isRegisteredGatewayProvider: (provider: string | null | undefined) => provider === "mercadopago",
}));

vi.mock("../../audit/index.js", () => ({
  auditRepository: mocks.auditRepository,
}));

vi.mock("../../distributor-gateway/index.js", () => ({
  distributorGatewayService: mocks.distributorGatewayService,
}));

vi.mock("../../../infra/logger", () => ({
  createLogger: () => mocks.logger,
}));

vi.mock("../../../infra/queue/payment-jobs.producer.js", () => ({
  schedulePaymentExpiration: mocks.schedulePaymentExpiration,
}));

const { paymentService } = await import("./payments.service.js");

const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const paymentId = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236903";

function capturedPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: paymentId,
    order_id: orderId,
    status: PaymentStatus.CAPTURED,
    provider: "mercadopago",
    provider_payment_ref: "mp-123",
    external_id: "mp-123",
    order: { distributor_id: distributorId },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((cb) => cb(mocks.tx));
  mocks.distributorGatewayService.getDecryptedCredentials.mockResolvedValue({ accessToken: "token" });
});

describe("paymentService.refund", () => {
  it("retorna null quando nao ha pagamento capturado", async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(null);

    const result = await paymentService.refund(orderId);

    expect(result).toBeNull();
    expect(mocks.gateway.refund).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("retorna null quando o pagamento nao tem referencia no provedor", async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(
      capturedPayment({ provider_payment_ref: null, external_id: null })
    );

    const result = await paymentService.refund(orderId);

    expect(result).toBeNull();
    expect(mocks.gateway.refund).not.toHaveBeenCalled();
  });

  it("fecha localmente sem chamar o gateway quando o provider nao e mercadopago", async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(
      capturedPayment({ provider: "mock", provider_payment_ref: null, external_id: "mock-123" })
    );

    const result = await paymentService.refund(orderId);

    expect(result).toEqual({ externalId: "mock-123", status: "refunded" });
    expect(mocks.gateway.refund).not.toHaveBeenCalled();
    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.PAYMENT_REFUNDED,
        orderId,
        payload: expect.objectContaining({ paymentId, provider: "mock", status: "refunded" }),
      }),
      mocks.tx
    );
  });

  it("reembolsa com sucesso: atualiza status, grava transacao e audita PAYMENT_REFUNDED", async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(capturedPayment());
    mocks.gateway.refund.mockResolvedValue({ externalId: "mp-123", status: "refunded", raw: { id: "mp-123" } });

    const result = await paymentService.refund(orderId);

    expect(result).toEqual({ externalId: "mp-123", status: "refunded", raw: { id: "mp-123" } });
    expect(mocks.gateway.refund).toHaveBeenCalledWith("mp-123");
    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });
    expect(mocks.tx.paymentTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payment_id: paymentId,
        action: "refund",
        provider_status: "refunded",
      }),
    });
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.PAYMENT_REFUNDED,
        orderId,
        payload: expect.objectContaining({ paymentId, status: "refunded" }),
      }),
      mocks.tx
    );
  });

  it("quando o gateway falha: nao atualiza o pagamento e audita PAYMENT_REFUND_FAILED", async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(capturedPayment());
    mocks.gateway.refund.mockResolvedValue({ externalId: "mp-123", status: "failed", raw: { id: "mp-123" } });

    const result = await paymentService.refund(orderId);

    expect(result).toEqual({ externalId: "mp-123", status: "failed", raw: { id: "mp-123" } });
    expect(mocks.tx.payment.update).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.PAYMENT_REFUND_FAILED }),
      mocks.tx
    );
  });
});
