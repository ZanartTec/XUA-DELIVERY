import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActorType, OrderStatus, SourceApp } from "@xua/shared/enums";

/**
 * U5 — teste-tabela da matriz status × comunicação (seção 1.3 do plano).
 *
 * Para cada linha de ORDER_REALTIME_MATRIX, executa o serviço real com
 * repositórios simulados e confere: quais salas receberam quais eventos, que
 * todo payload carrega o pedido certo e quem recebeu push. Também prova que,
 * se a transação falha (rollback), nada é emitido.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  published: [] as Array<{ room: string; event: string; payload: Record<string, unknown> }>,
  pushSink: vi.fn(),
  orderRepository: {
    findById: vi.fn(),
    findByIdWithItemsForUpdate: vi.fn(),
    updateStatus: vi.fn(),
    update: vi.fn(),
    findNewOrderSummary: vi.fn(),
  },
  auditRepository: { emit: vi.fn(async () => {}) },
  notificationService: { send: vi.fn(async () => {}) },
  otpService: { generateInTx: vi.fn(), cacheCode: vi.fn(async () => {}) },
  distributorRepository: { resolveDistributorId: vi.fn(), findDriversByDistributor: vi.fn() },
  receiptService: { issueInTx: vi.fn() },
}));

vi.mock("@api/infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));
vi.mock("@api/infra/realtime/publisher.js", () => ({
  realtimePublisher: {
    publish: (room: string, event: string, payload: Record<string, unknown>) => {
      mocks.published.push({ room, event, payload });
    },
  },
}));
vi.mock("@api/infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@api/modules/orders/repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));
vi.mock("@api/modules/audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));
vi.mock("@api/modules/orders/services/order-inventory.helpers.js", () => ({
  resolveOrderInventoryLines: vi.fn(async () => []),
  assertStockAvailableForOrder: vi.fn(async () => {}),
  applyOrderInventoryMovements: vi.fn(async () => {}),
  inventoryAuditLines: vi.fn(() => []),
}));
vi.mock("@api/modules/user-subscriptions/services/subscription-settlement.service.js", () => ({
  subscriptionSettlementService: {
    settleDelivered: vi.fn(async () => {}),
    settleFailed: vi.fn(async () => null),
    notifyPersistentFailure: vi.fn(async () => {}),
  },
}));
vi.mock("@api/modules/notifications/services/notification.service.js", () => ({
  notificationService: mocks.notificationService,
}));
vi.mock("@api/modules/driver/services/otp.service.js", () => ({
  otpService: mocks.otpService,
}));
vi.mock("@api/modules/distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));
vi.mock("@api/modules/orders/services/receipt.service.js", () => ({
  receiptService: mocks.receiptService,
}));
vi.mock("@api/modules/orders/services/order-bottle.service.js", () => ({
  publishBottleStepEvents: vi.fn(),
  recordBottleStepInTx: vi.fn(),
}));
vi.mock("@api/infra/queue/payment-jobs.producer.js", () => ({
  enqueueRefundPaymentJob: vi.fn(async () => {}),
}));
vi.mock("@api/modules/distributor/services/schedule.service.js", () => ({ scheduleService: {} }));
vi.mock("@api/modules/deposits/services/deposit-settlement.service.js", () => ({
  depositSettlementService: {},
}));
vi.mock("@api/modules/distributor-gateway/index.js", () => ({
  distributorGatewayService: {},
  isPaymentMethodAllowed: () => true,
  DEFAULT_PUBLIC_PAYMENT_METHODS: {},
}));

const { ORDER_REALTIME_MATRIX } = await import("@api/modules/orders/realtime/order-realtime-matrix.js");
const { createOrderService } = await import("@api/modules/orders/services/create-order.service.js");
const { acceptOrderService } = await import("@api/modules/orders/services/accept-order.service.js");
const { rejectOrderService } = await import("@api/modules/orders/services/reject-order.service.js");
const { dispatchOrderService } = await import("@api/modules/orders/services/dispatch-order.service.js");
const { deliverOrderService } = await import("@api/modules/orders/services/deliver-order.service.js");
const { cancelOrderService } = await import("@api/modules/orders/services/cancel-order.service.js");
const { pushDispatcher } = await import("@api/modules/notifications/services/push-dispatcher.js");
const { rooms } = await import("@api/infra/realtime/rooms.js");

const orderId = "5f0c1d2e-0000-4000-a000-000000000001";
const consumerId = "5f0c1d2e-0000-4000-a000-000000000002";
const distributorId = "5f0c1d2e-0000-4000-a000-000000000003";
const distributorUserId = "5f0c1d2e-0000-4000-a000-000000000004";
const driverId = "5f0c1d2e-0000-4000-a000-000000000005";

const tx = {
  payment: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), update: vi.fn() },
};

type Scenario = {
  /** Estado do pedido antes da ação. */
  current: Record<string, unknown>;
  run: () => Promise<unknown>;
  subscription?: boolean;
};

function currentOrder(status: OrderStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    consumer_id: consumerId,
    distributor_id: distributorId,
    driver_id: null,
    status,
    delivery_date: new Date("2026-11-20T00:00:00.000Z"),
    bottle_step_recorded_at: new Date("2026-11-20T10:00:00.000Z"),
    items: [],
    ...overrides,
  };
}

const SCENARIOS: Record<string, Scenario> = {
  confirm_payment: {
    current: currentOrder(OrderStatus.PAYMENT_PENDING),
    run: () => createOrderService.confirmOrder(orderId),
  },
  send_to_distributor_single: {
    current: currentOrder(OrderStatus.CONFIRMED),
    run: () => createOrderService.sendToDistributor(orderId),
  },
  send_to_distributor_subscription: {
    current: currentOrder(OrderStatus.CONFIRMED),
    subscription: true,
    run: () => createOrderService.sendToDistributor(orderId),
  },
  accept: {
    current: currentOrder(OrderStatus.SENT_TO_DISTRIBUTOR),
    run: () => acceptOrderService.acceptOrder(orderId, distributorUserId),
  },
  reject: {
    current: currentOrder(OrderStatus.SENT_TO_DISTRIBUTOR),
    run: () => rejectOrderService.rejectOrder(orderId, distributorUserId, "OUT_OF_STOCK"),
  },
  assign_driver: {
    current: currentOrder(OrderStatus.ACCEPTED_BY_DISTRIBUTOR),
    run: () => dispatchOrderService.assignDriver(orderId, distributorUserId, driverId),
  },
  complete_checklist: {
    current: currentOrder(OrderStatus.ACCEPTED_BY_DISTRIBUTOR),
    run: () => dispatchOrderService.completeChecklist(orderId, distributorUserId),
  },
  dispatch: {
    current: currentOrder(OrderStatus.READY_FOR_DISPATCH),
    run: () => dispatchOrderService.dispatch(orderId, distributorUserId, driverId),
  },
  deliver: {
    current: currentOrder(OrderStatus.OUT_FOR_DELIVERY, { driver_id: driverId }),
    run: () =>
      deliverOrderService.deliverOrder(orderId, {
        type: ActorType.DRIVER,
        id: driverId,
        sourceApp: SourceApp.DRIVER_WEB,
      }),
  },
  delivery_failed: {
    current: currentOrder(OrderStatus.OUT_FOR_DELIVERY, { driver_id: driverId }),
    run: () => deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente"),
  },
  schedule_redelivery: {
    current: currentOrder(OrderStatus.DELIVERY_FAILED, { driver_id: driverId }),
    run: () =>
      deliverOrderService.scheduleRedelivery(orderId, "ops-user", new Date("2026-11-22T00:00:00.000Z")),
  },
  cancel_by_consumer_before_distributor: {
    current: currentOrder(OrderStatus.PAYMENT_PENDING),
    run: () => cancelOrderService.cancelOrder(orderId, consumerId, "consumer", "Desisti"),
  },
  cancel_by_consumer_after_accept: {
    current: currentOrder(OrderStatus.ACCEPTED_BY_DISTRIBUTOR, { driver_id: driverId }),
    run: () => cancelOrderService.cancelOrder(orderId, consumerId, "consumer", "Desisti"),
  },
  cancel_by_distributor: {
    current: currentOrder(OrderStatus.SENT_TO_DISTRIBUTOR),
    run: () => cancelOrderService.cancelOrder(orderId, distributorUserId, "distributor", "Sem estoque"),
  },
  cancel_by_ops_out_for_delivery: {
    current: currentOrder(OrderStatus.OUT_FOR_DELIVERY, { driver_id: driverId }),
    run: () => cancelOrderService.cancelOrder(orderId, "ops-user", "ops", "Endereço inválido"),
  },
};

function audienceOfRoom(room: string): string {
  if (room === rooms.consumer(consumerId)) return "consumer";
  if (room === rooms.distributor(distributorId)) return "distributor";
  if (room === rooms.driver(driverId)) return "driver";
  if (room === rooms.ops()) return "ops";
  return `UNEXPECTED_ROOM(${room})`;
}

function audienceOfPush(target: { kind: string; id: string }): string {
  if (target.kind === "distributor" && target.id === distributorId) return "distributor";
  if (target.kind === "user" && target.id === consumerId) return "consumer";
  if (target.kind === "user" && target.id === driverId) return "driver";
  return `UNEXPECTED_TARGET(${target.kind}:${target.id})`;
}

function arrange(scenario: Scenario) {
  const current = scenario.current;
  mocks.orderRepository.findById.mockResolvedValue(current);
  mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
  mocks.orderRepository.updateStatus.mockImplementation(
    async (_id: string, status: string, extra: Record<string, unknown> = {}) => ({
      ...current,
      ...extra,
      status,
      ...(status === OrderStatus.OUT_FOR_DELIVERY ? { driver_id: driverId } : {}),
    })
  );
  mocks.orderRepository.update.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
    ...current,
    ...data,
  }));
  mocks.orderRepository.findNewOrderSummary.mockResolvedValue({
    total_cents: scenario.subscription ? 0 : 3800,
    delivery_date: new Date("2026-11-20T00:00:00.000Z"),
    items: [{ quantity: 2 }],
    consumer: { name: "João Silva" },
    subscription_delivery_date: scenario.subscription ? { id: "sdd-1" } : null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.published.length = 0;
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  mocks.pushSink.mockResolvedValue(undefined);
  pushDispatcher.setSink(mocks.pushSink);
  mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
  mocks.distributorRepository.findDriversByDistributor.mockResolvedValue([{ id: driverId }]);
  mocks.otpService.generateInTx.mockResolvedValue("4321");
  mocks.receiptService.issueInTx.mockResolvedValue({ receipt: { number: 7 } });
});

describe("U5 — matriz status × comunicação", () => {
  it("toda linha da matriz tem um cenário executável", () => {
    for (const rule of ORDER_REALTIME_MATRIX) {
      expect(SCENARIOS[rule.scenario], rule.scenario).toBeDefined();
    }
  });

  for (const rule of ORDER_REALTIME_MATRIX) {
    describe(`${rule.scenario}: ${rule.description}`, () => {
      const scenario = SCENARIOS[rule.scenario];

      it("emite exatamente os eventos da matriz, cada um na sala certa", async () => {
        arrange(scenario);
        await scenario.run();

        const emitted = mocks.published.map((p) => `${audienceOfRoom(p.room)}:${p.event}`).sort();
        const expected = rule.sockets.map((s) => `${s.audience}:${s.event}`).sort();
        expect(emitted).toEqual(expected);
      });

      it("todo payload aponta para o pedido e o status certos", async () => {
        arrange(scenario);
        await scenario.run();

        for (const { event, payload } of mocks.published) {
          expect(payload.orderId).toBe(orderId);
          if (event === "otp_generated") {
            expect(payload.code).toBe("4321");
          } else {
            expect(payload.status).toBe(rule.to);
          }
        }
      });

      it("dispara push só para quem a matriz manda", async () => {
        arrange(scenario);
        await scenario.run();

        const pushed = mocks.pushSink.mock.calls
          .map(([intent]) => audienceOfPush(intent.target))
          .sort();
        expect(pushed).toEqual([...rule.push].sort());
        for (const [intent] of mocks.pushSink.mock.calls) {
          expect(intent.url).toContain(intent.target.kind === "distributor" ? "/distributor/" : "/");
          expect(intent.dedupeKey).toBeTruthy();
        }
      });

      it("transação que falha (rollback) não emite nada", async () => {
        arrange(scenario);
        mocks.orderRepository.updateStatus.mockRejectedValue(new Error("rollback"));
        mocks.orderRepository.update.mockRejectedValue(new Error("rollback"));

        await expect(scenario.run()).rejects.toThrow("rollback");
        expect(mocks.published).toEqual([]);
        expect(mocks.pushSink).not.toHaveBeenCalled();
      });
    });
  }
});

describe("U5 — casos fora da tabela", () => {
  it("troca de motorista avisa o motorista anterior", async () => {
    const otherDriver = "5f0c1d2e-0000-4000-a000-000000000099";
    mocks.distributorRepository.findDriversByDistributor.mockResolvedValue([{ id: driverId }, { id: otherDriver }]);
    arrange({
      current: currentOrder(OrderStatus.READY_FOR_DISPATCH, { driver_id: driverId }),
      run: async () => {},
    });

    await dispatchOrderService.assignDriver(orderId, distributorUserId, otherDriver);

    const previous = mocks.published.find((p) => p.room === rooms.driver(driverId));
    expect(previous).toMatchObject({
      event: "order_status_changed",
      payload: { orderId, driverId: otherDriver, reason: "driver_reassigned" },
    });
    expect(mocks.published.find((p) => p.room === rooms.driver(otherDriver))?.event).toBe("delivery_assigned");
  });

  it("cancelamento pelo cliente informa à distribuidora quem cancelou", async () => {
    arrange(SCENARIOS.cancel_by_consumer_after_accept);
    await SCENARIOS.cancel_by_consumer_after_accept.run();

    const toDistributor = mocks.published.find((p) => p.room === rooms.distributor(distributorId));
    expect(toDistributor?.payload).toMatchObject({
      status: OrderStatus.CANCELLED,
      previousStatus: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
      cancelledBy: "consumer",
      reason: "Desisti",
    });
    const push = mocks.pushSink.mock.calls[0][0];
    expect(push.body).toContain("pelo cliente");
  });
});
