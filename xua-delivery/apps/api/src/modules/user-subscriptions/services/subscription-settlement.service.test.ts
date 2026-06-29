import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../notifications/services/notification.service.js", () => ({
  notificationService: mocks.notificationService,
}));
vi.mock("../../../infra/logger/index.js", () => ({ createLogger: () => mocks.logger }));

const { subscriptionSettlementService } = await import("./subscription-settlement.service.js");

const orderId = "66666666-6666-4666-8666-666666666666";
const deliveryId = "77777777-7777-4777-8777-777777777777";
const subId = "88888888-8888-4888-8888-888888888888";

function txMock() {
  return {
    subscriptionDeliveryDate: { findUnique: vi.fn(), update: vi.fn() },
    userSubscription: { update: vi.fn() },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("settleDelivered", () => {
  it("ORDER_CREATED → DELIVERED", async () => {
    const tx = txMock();
    tx.subscriptionDeliveryDate.findUnique.mockResolvedValue({ id: deliveryId, status: "ORDER_CREATED" });

    await subscriptionSettlementService.settleDelivered(tx as never, orderId);

    expect(tx.subscriptionDeliveryDate.update).toHaveBeenCalledWith({
      where: { id: deliveryId },
      data: { status: "DELIVERED" },
    });
  });

  it("no-op se não houver entrega de assinatura", async () => {
    const tx = txMock();
    tx.subscriptionDeliveryDate.findUnique.mockResolvedValue(null);

    await subscriptionSettlementService.settleDelivered(tx as never, orderId);

    expect(tx.subscriptionDeliveryDate.update).not.toHaveBeenCalled();
  });
});

describe("settleFailed", () => {
  it("abaixo do teto: recredita saldo e volta a PENDING, sem aviso", async () => {
    const tx = txMock();
    tx.subscriptionDeliveryDate.findUnique.mockResolvedValue({
      id: deliveryId,
      status: "ORDER_CREATED",
      generation_attempts: 1,
      quantity_for_this_delivery: 1,
      user_subscription: { id: subId, consumer_id: "c1", status: "ACTIVE" },
    });
    tx.userSubscription.update.mockResolvedValue({ remaining_quantity: 5 });

    const notice = await subscriptionSettlementService.settleFailed(tx as never, orderId);

    expect(notice).toBeNull();
    expect(tx.subscriptionDeliveryDate.update).toHaveBeenCalledWith({
      where: { id: deliveryId },
      data: { status: "PENDING", order_id: null },
    });
    expect(tx.userSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: subId },
        data: expect.objectContaining({ remaining_quantity: { increment: 1 } }),
      })
    );
  });

  it("no teto (3 tentativas): marca FAILED, reverte COMPLETED→ACTIVE e retorna aviso", async () => {
    const tx = txMock();
    tx.subscriptionDeliveryDate.findUnique.mockResolvedValue({
      id: deliveryId,
      status: "ORDER_CREATED",
      generation_attempts: 3,
      quantity_for_this_delivery: 2,
      user_subscription: { id: subId, consumer_id: "c1", status: "COMPLETED" },
    });
    tx.userSubscription.update.mockResolvedValue({ remaining_quantity: 2 });

    const notice = await subscriptionSettlementService.settleFailed(tx as never, orderId);

    expect(notice).toMatchObject({ subscriptionId: subId, consumerId: "c1", deliveryDateId: deliveryId });
    expect(tx.subscriptionDeliveryDate.update).toHaveBeenCalledWith({
      where: { id: deliveryId },
      data: { status: "FAILED", order_id: null },
    });
    expect(tx.userSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          remaining_quantity: { increment: 2 },
          status: "ACTIVE",
        }),
      })
    );
  });

  it("no-op quando a entrega não está ORDER_CREATED", async () => {
    const tx = txMock();
    tx.subscriptionDeliveryDate.findUnique.mockResolvedValue({
      id: deliveryId,
      status: "DELIVERED",
      generation_attempts: 1,
      quantity_for_this_delivery: 1,
      user_subscription: { id: subId, consumer_id: "c1", status: "ACTIVE" },
    });

    const notice = await subscriptionSettlementService.settleFailed(tx as never, orderId);

    expect(notice).toBeNull();
    expect(tx.subscriptionDeliveryDate.update).not.toHaveBeenCalled();
    expect(tx.userSubscription.update).not.toHaveBeenCalled();
  });
});

describe("notifyPersistentFailure", () => {
  it("envia push ao consumidor e loga para ops", async () => {
    await subscriptionSettlementService.notifyPersistentFailure({
      consumerId: "c1",
      subscriptionId: subId,
      deliveryDateId: deliveryId,
      remainingQuantity: 2,
    });

    expect(mocks.notificationService.send).toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
