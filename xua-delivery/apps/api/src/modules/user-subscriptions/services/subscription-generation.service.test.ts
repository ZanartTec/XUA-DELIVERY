import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  orderService: {
    createPrepaidOrderInTx: vi.fn(),
    sendToDistributor: vi.fn(),
  },
  scheduleService: { getAvailableDates: vi.fn() },
  repo: {
    findDueDeliveries: vi.fn(),
    findOrphanConfirmedDeliveries: vi.fn(),
    lockDueDeliveryForUpdate: vi.fn(),
  },
  tx: {
    subscriptionDeliveryDate: { findUnique: vi.fn(), update: vi.fn() },
    userSubscription: { update: vi.fn() },
  },
  prisma: { $transaction: vi.fn() },
}));

vi.mock("../../../infra/prisma/client.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../../infra/logger/index.js", () => ({ createLogger: () => mocks.logger }));
vi.mock("../../orders/services/orders.service.js", () => ({ orderService: mocks.orderService }));
vi.mock("../../distributor/services/schedule.service.js", () => ({
  scheduleService: mocks.scheduleService,
}));
vi.mock("../repository/user-subscriptions.repository.js", () => ({
  userSubscriptionsRepository: mocks.repo,
}));

const { subscriptionGenerationService } = await import("./subscription-generation.service.js");

const deliveryId = "33333333-3333-4333-8333-333333333333";
const subId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";

/** Entrega elegível com data no futuro (sem reagendamento). */
function eligibleDelivery() {
  return {
    id: deliveryId,
    order_id: null,
    status: "PENDING",
    delivery_date: new Date("2999-01-01"),
    time_slot_id: "slot-1",
    quantity_for_this_delivery: 1,
    time_slot: { window: "MORNING" },
    user_subscription: {
      id: subId,
      status: "ACTIVE",
      consumer_id: "consumer-1",
      distributor_id: "dist-1",
      address_id: "addr-1",
      remaining_quantity: 5,
      address: { zone_id: "zone-1" },
      plan: { product: { id: "prod-1", name: "Água 20L" } },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => unknown) =>
    cb(mocks.tx)
  );
  mocks.repo.findOrphanConfirmedDeliveries.mockResolvedValue([]);
  mocks.orderService.createPrepaidOrderInTx.mockResolvedValue({ id: orderId });
  mocks.orderService.sendToDistributor.mockResolvedValue({ id: orderId, status: "SENT_TO_DISTRIBUTOR" });
});

describe("subscriptionGenerationService.generateDueDeliveries", () => {
  it("gera pedido pré-pago, debita saldo e envia ao distribuidor", async () => {
    mocks.repo.findDueDeliveries.mockResolvedValue([{ id: deliveryId, user_subscription_id: subId }]);
    mocks.repo.lockDueDeliveryForUpdate.mockResolvedValue(deliveryId);
    mocks.tx.subscriptionDeliveryDate.findUnique.mockResolvedValue(eligibleDelivery());
    mocks.tx.userSubscription.update.mockResolvedValue({ remaining_quantity: 4 });

    const result = await subscriptionGenerationService.generateDueDeliveries();

    expect(mocks.orderService.createPrepaidOrderInTx).toHaveBeenCalledTimes(1);
    expect(mocks.tx.subscriptionDeliveryDate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: deliveryId } })
    );
    expect(mocks.orderService.sendToDistributor).toHaveBeenCalledWith(orderId);
    expect(result).toMatchObject({ processed: 1, created: 1, skipped: 0, failed: 0 });
  });

  it("é idempotente: não gera pedido quando o lock falha (já processada/travada)", async () => {
    mocks.repo.findDueDeliveries.mockResolvedValue([{ id: deliveryId, user_subscription_id: subId }]);
    mocks.repo.lockDueDeliveryForUpdate.mockResolvedValue(null);

    const result = await subscriptionGenerationService.generateDueDeliveries();

    expect(mocks.orderService.createPrepaidOrderInTx).not.toHaveBeenCalled();
    expect(mocks.orderService.sendToDistributor).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 1, created: 0, skipped: 1 });
  });

  it("marca COMPLETED quando o saldo zera", async () => {
    mocks.repo.findDueDeliveries.mockResolvedValue([{ id: deliveryId, user_subscription_id: subId }]);
    mocks.repo.lockDueDeliveryForUpdate.mockResolvedValue(deliveryId);
    mocks.tx.subscriptionDeliveryDate.findUnique.mockResolvedValue({
      ...eligibleDelivery(),
      user_subscription: { ...eligibleDelivery().user_subscription, remaining_quantity: 1 },
    });
    mocks.tx.userSubscription.update.mockResolvedValue({ remaining_quantity: 0 });

    await subscriptionGenerationService.generateDueDeliveries();

    // 1ª chamada: decrement; 2ª chamada: status COMPLETED
    expect(mocks.tx.userSubscription.update).toHaveBeenCalledTimes(2);
    expect(mocks.tx.userSubscription.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: "COMPLETED" } })
    );
  });

  it("reagenda entrega vencida para a próxima data válida", async () => {
    mocks.repo.findDueDeliveries.mockResolvedValue([{ id: deliveryId, user_subscription_id: subId }]);
    mocks.repo.lockDueDeliveryForUpdate.mockResolvedValue(deliveryId);
    mocks.tx.subscriptionDeliveryDate.findUnique.mockResolvedValue({
      ...eligibleDelivery(),
      delivery_date: new Date("2000-01-01"), // no passado
    });
    mocks.tx.userSubscription.update.mockResolvedValue({ remaining_quantity: 4 });
    mocks.scheduleService.getAvailableDates.mockResolvedValue([
      { date: "2999-02-02", morning_available: true, afternoon_available: false },
    ]);

    const result = await subscriptionGenerationService.generateDueDeliveries();

    expect(mocks.scheduleService.getAvailableDates).toHaveBeenCalled();
    expect(mocks.tx.subscriptionDeliveryDate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delivery_date: new Date("2999-02-02") }),
      })
    );
    expect(result).toMatchObject({ created: 1, rescheduled: 1 });
  });

  it("reenvia pedidos órfãos presos em CONFIRMED", async () => {
    mocks.repo.findDueDeliveries.mockResolvedValue([]);
    mocks.repo.findOrphanConfirmedDeliveries.mockResolvedValue([
      { id: deliveryId, order_id: orderId, user_subscription_id: subId },
    ]);

    const result = await subscriptionGenerationService.generateDueDeliveries();

    expect(mocks.orderService.sendToDistributor).toHaveBeenCalledWith(orderId);
    expect(result).toMatchObject({ resent: 1 });
  });
});
