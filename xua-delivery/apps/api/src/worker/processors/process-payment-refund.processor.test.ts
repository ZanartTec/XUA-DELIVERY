import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentService: { refund: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../modules/payments/services/payments.service.js", () => ({
  paymentService: mocks.paymentService,
}));

vi.mock("../../infra/logger", () => ({
  createLogger: () => mocks.logger,
}));

const { processPaymentRefund } = await import("./process-payment-refund.processor.js");

const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const paymentId = "7e1d7b55-3f52-4d10-aac3-74387c236902";

function job() {
  return {
    id: "job-1",
    attemptsMade: 0,
    data: {
      jobName: "refund-payment",
      orderId,
      paymentId,
      correlationId: "corr-1",
      requestedAt: new Date().toISOString(),
      source: "api",
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processPaymentRefund", () => {
  it("retorna skipped quando nao ha pagamento capturado para reembolsar", async () => {
    mocks.paymentService.refund.mockResolvedValue(null);

    const result = await processPaymentRefund(job());

    expect(result).toEqual({ action: "skipped", reason: "no_captured_payment" });
  });

  it("retorna refunded quando o reembolso e bem sucedido", async () => {
    mocks.paymentService.refund.mockResolvedValue({ externalId: "mp-123", status: "refunded" });

    const result = await processPaymentRefund(job());

    expect(result).toEqual({ action: "refunded", externalId: "mp-123" });
  });

  it("lanca erro quando o reembolso falha, para o BullMQ tentar de novo", async () => {
    mocks.paymentService.refund.mockResolvedValue({ externalId: "mp-123", status: "failed" });

    await expect(processPaymentRefund(job())).rejects.toThrow(
      `PAYMENT_REFUND_FAILED:${orderId}:${paymentId}`
    );
  });
});
