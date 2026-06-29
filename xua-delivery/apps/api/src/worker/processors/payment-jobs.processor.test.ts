import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus, PaymentKind, PaymentStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  gateway: { getPayment: vi.fn(), normalizeStatus: vi.fn() },
  auditRepository: { emit: vi.fn() },
  orderService: { confirmOrder: vi.fn(), sendToDistributor: vi.fn() },
  distributorGatewayService: {
    getDecryptedCredentials: vi.fn(),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  tx: {
    payment: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    order: { findFirst: vi.fn(), update: vi.fn() },
    userSubscription: { findFirst: vi.fn(), updateMany: vi.fn() },
    paymentTransaction: { findFirst: vi.fn(), create: vi.fn() },
    paymentWebhookEvent: { update: vi.fn() },
  },
  prisma: {
    paymentWebhookEvent: { findUnique: vi.fn(), update: vi.fn() },
    order: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("../../modules/payments/gateway/payments.gateway.js", () => ({
  PAYMENT_PROVIDERS: { mercadoPago: "mercadopago" },
  getPaymentGateway: () => mocks.gateway,
}));

vi.mock("../../modules/audit/index.js", () => ({
  auditRepository: mocks.auditRepository,
}));

vi.mock("../../modules/orders/index.js", () => ({
  orderService: mocks.orderService,
}));

vi.mock("../../infra/logger/index.js", () => ({
  createLogger: () => mocks.logger,
}));

vi.mock("../../modules/distributor-gateway/index.js", () => ({
  distributorGatewayService: mocks.distributorGatewayService,
}));

const { processPaymentJob } = await import("./payment-jobs.processor.js");

const webhookEventId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const paymentId = "7e1d7b55-3f52-4d10-aac3-74387c236903";
const providerPaymentId = "1346835923";
const distributorId = "00000000-0000-4000-a000-000000000010";

function job() {
  return {
    id: "job-1",
    attemptsMade: 0,
    data: {
      jobName: "process-webhook",
      webhookEventId,
      correlationId: "corr-1",
      requestedAt: new Date().toISOString(),
      source: "api",
    },
  };
}

function event(payload: Record<string, unknown>) {
  return {
    id: webhookEventId,
    distributor_id: distributorId,
    provider_event_ref: `payment:${providerPaymentId}:payment.updated`,
    event_type: "payment.updated",
    payload,
    processed_at: null,
  };
}

function providerPayment(overrides: Record<string, unknown> = {}) {
  return {
    providerPaymentId,
    status: "approved",
    statusDetail: "accredited",
    externalReference: undefined,
    orderReference: undefined,
    paymentKind: undefined,
    paymentMethod: "pix",
    amountCents: 5000,
    paidAt: new Date("2026-05-28T22:42:37.000Z"),
    raw: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.gateway.getPayment.mockResolvedValue(providerPayment());
  mocks.gateway.normalizeStatus.mockReturnValue(PaymentStatus.CAPTURED);
  mocks.distributorGatewayService.getDecryptedCredentials.mockResolvedValue({
    accessToken: "test-access-token",
    webhookSecret: "test-webhook-secret",
    publicKey: null,
  });
  mocks.tx.payment.findFirst.mockResolvedValue({
    id: paymentId,
    order_id: orderId,
    user_subscription_id: null,
    amount_cents: 5000,
    status: PaymentStatus.CREATED,
    payment_method: "pix",
    paid_at: null,
  });
  mocks.tx.payment.update.mockResolvedValue({ id: paymentId, status: PaymentStatus.CAPTURED });
  mocks.tx.paymentTransaction.create.mockResolvedValue({ id: "txn-1" });
  mocks.tx.paymentTransaction.findFirst.mockResolvedValue(null);
  mocks.tx.order.update.mockResolvedValue({ id: orderId });
  mocks.tx.paymentWebhookEvent.update.mockResolvedValue({ id: webhookEventId });
  mocks.prisma.paymentWebhookEvent.update.mockResolvedValue({ id: webhookEventId });
  mocks.auditRepository.emit.mockResolvedValue(undefined);
  mocks.prisma.order.findUnique
    .mockResolvedValueOnce({ id: orderId, status: OrderStatus.PAYMENT_PENDING })
    .mockResolvedValueOnce({ id: orderId, status: OrderStatus.CONFIRMED });
  mocks.orderService.confirmOrder.mockResolvedValue(undefined);
  mocks.orderService.sendToDistributor.mockResolvedValue(undefined);
});

describe("processPaymentJob", () => {
  it("resolve webhook sem external_reference usando xua_context validado", async () => {
    mocks.prisma.paymentWebhookEvent.findUnique.mockResolvedValue(event({
      data: { id: providerPaymentId },
      xua_context: { reference_id: orderId, payment_kind: PaymentKind.ORDER },
    }));

    const result = await processPaymentJob(job() as never);

    expect(mocks.tx.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ order_id: { in: [orderId] } }]),
      }),
    }));
    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: expect.objectContaining({
        status: PaymentStatus.CAPTURED,
        provider_payment_ref: providerPaymentId,
      }),
    });
    expect(mocks.prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: webhookEventId },
      data: { processed_at: expect.any(Date), processing_error: null },
    });
    expect(mocks.orderService.confirmOrder).toHaveBeenCalledWith(orderId);
    expect(mocks.orderService.sendToDistributor).toHaveBeenCalledWith(orderId);
    expect(result).toEqual(expect.objectContaining({ ok: true, providerPaymentId, orderId }));
  });

  it("marca divergencia de valor como erro nao retentavel", async () => {
    mocks.prisma.paymentWebhookEvent.findUnique.mockResolvedValue(event({
      data: { id: providerPaymentId },
      xua_context: { reference_id: orderId, payment_kind: PaymentKind.ORDER },
    }));
    mocks.gateway.getPayment.mockResolvedValue(providerPayment({ amountCents: 4000 }));

    const result = await processPaymentJob(job() as never);

    expect(result).toEqual({
      ok: false,
      retryable: false,
      error: `PAYMENT_AMOUNT_MISMATCH:5000:4000`,
    });
    expect(mocks.tx.payment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: webhookEventId },
      data: {
        processed_at: expect.any(Date),
        processing_error: `PAYMENT_AMOUNT_MISMATCH:5000:4000`,
        retry_count: { increment: 1 },
      },
    });
  });

  it("nao usa xua_context sem kind reconhecido", async () => {
    mocks.prisma.paymentWebhookEvent.findUnique.mockResolvedValue(event({
      data: { id: providerPaymentId },
      xua_context: { reference_id: orderId },
    }));
    mocks.tx.payment.findFirst.mockResolvedValue(null);

    await expect(processPaymentJob(job() as never)).rejects.toThrow(
      `PAYMENT_REFERENCE_MISSING:${providerPaymentId}`
    );

    expect(mocks.tx.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { provider_payment_ref: { in: [providerPaymentId] } },
          { external_id: { in: [providerPaymentId] } },
        ],
      }),
    }));
    expect(mocks.prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: webhookEventId },
      data: {
        processing_error: `PAYMENT_REFERENCE_MISSING:${providerPaymentId}`,
        retry_count: { increment: 1 },
      },
    });
  });
});
