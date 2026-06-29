import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentStatus, UserSubscriptionStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  auditRepository: { emit: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  tx: {
    userSubscription: { findUnique: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), update: vi.fn() },
  },
  prisma: { $transaction: vi.fn() },
}));

vi.mock("../../infra/prisma/client", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../infra/logger", () => ({ createLogger: () => mocks.logger }));
vi.mock("../../modules/audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

const { processSubscriptionExpiration } = await import("./expire-subscription.processor.js");

const subscriptionId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";

function job() {
  return {
    id: "job-1",
    data: {
      jobName: "expire-subscription",
      subscriptionId,
      correlationId: "corr-1",
      requestedAt: new Date().toISOString(),
      source: "api",
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => unknown) =>
    cb(mocks.tx)
  );
});

describe("processSubscriptionExpiration", () => {
  it("expira assinatura PENDING_PAYMENT e marca pagamento EXPIRED", async () => {
    mocks.tx.userSubscription.findUnique.mockResolvedValue({
      id: subscriptionId,
      status: UserSubscriptionStatus.PENDING_PAYMENT,
    });
    mocks.tx.payment.findFirst.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.CREATED,
    });

    const result = await processSubscriptionExpiration(job());

    expect(result).toMatchObject({ action: "expired", subscriptionId, paymentId });
    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: PaymentStatus.EXPIRED },
    });
    expect(mocks.tx.userSubscription.update).toHaveBeenCalledWith({
      where: { id: subscriptionId },
      data: { status: UserSubscriptionStatus.CANCELLED },
    });
    expect(mocks.auditRepository.emit).toHaveBeenCalled();
  });

  it("é no-op se a assinatura já está ACTIVE (pagamento capturado / retomado)", async () => {
    mocks.tx.userSubscription.findUnique.mockResolvedValue({
      id: subscriptionId,
      status: UserSubscriptionStatus.ACTIVE,
    });

    const result = await processSubscriptionExpiration(job());

    expect(result).toMatchObject({ action: "skipped" });
    expect(mocks.tx.userSubscription.update).not.toHaveBeenCalled();
    expect(mocks.tx.payment.update).not.toHaveBeenCalled();
  });

  it("é no-op se a assinatura não existe", async () => {
    mocks.tx.userSubscription.findUnique.mockResolvedValue(null);

    const result = await processSubscriptionExpiration(job());

    expect(result).toMatchObject({ action: "skipped", reason: "subscription_not_found" });
    expect(mocks.tx.userSubscription.update).not.toHaveBeenCalled();
  });

  it("não marca pagamento EXPIRED se ele já foi capturado", async () => {
    mocks.tx.userSubscription.findUnique.mockResolvedValue({
      id: subscriptionId,
      status: UserSubscriptionStatus.PENDING_PAYMENT,
    });
    mocks.tx.payment.findFirst.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.CAPTURED,
    });

    const result = await processSubscriptionExpiration(job());

    expect(result).toMatchObject({ action: "expired" });
    expect(mocks.tx.payment.update).not.toHaveBeenCalled();
    // a assinatura ainda é cancelada (estava PENDING_PAYMENT)
    expect(mocks.tx.userSubscription.update).toHaveBeenCalled();
  });
});
