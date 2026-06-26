import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryWindow, OrderStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => {
  class MockInventoryServiceError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "InventoryServiceError";
    }
  }

  return {
    InventoryServiceError: MockInventoryServiceError,
    transaction: vi.fn(),
    socketTo: vi.fn(),
    redisGet: vi.fn(),
    orderRepository: {
      findById: vi.fn(),
      findByIdWithDetails: vi.fn(),
      update: vi.fn(),
    },
    auditRepository: { emit: vi.fn() },
    inventoryRepository: {
      findActiveInventoryItemsByProductIds: vi.fn(),
      findActiveReturnableEmptyItem: vi.fn(),
      findBalanceForUpdate: vi.fn(),
    },
    inventoryService: { applyMovement: vi.fn() },
    notificationService: { send: vi.fn() },
    paymentService: { charge: vi.fn() },
    distributorRepository: { resolveDistributorId: vi.fn(), findDriversByDistributor: vi.fn() },
    otpService: { generateInTx: vi.fn(), cacheCode: vi.fn() },
  };
});

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../../../infra/socket/gateway.js", () => ({
  getIO: () => ({ to: mocks.socketTo }),
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../../../infra/redis/client.js", () => ({
  default: { get: mocks.redisGet },
}));

vi.mock("../repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));

vi.mock("../../audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

vi.mock("../../inventory/repository/inventory.repository.js", () => ({
  inventoryRepository: mocks.inventoryRepository,
}));

vi.mock("../../inventory/services/inventory.service.js", () => ({
  inventoryService: mocks.inventoryService,
  InventoryServiceError: mocks.InventoryServiceError,
}));

vi.mock("../../distributor/services/schedule.service.js", () => ({
  scheduleService: {},
}));

vi.mock("../../deposits/services/deposit-settlement.service.js", () => ({
  depositSettlementService: {
    resolveBottleGroups: vi.fn(),
    settlePerBottle: vi.fn(),
    settleDelivery: vi.fn(),
  },
}));

vi.mock("../../notifications/services/notification.service.js", () => ({
  notificationService: mocks.notificationService,
}));

vi.mock("../../payments/services/payments.service.js", () => ({
  paymentService: mocks.paymentService,
}));

vi.mock("../../distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

vi.mock("../../driver/services/otp.service.js", () => ({
  otpService: mocks.otpService,
}));

const { orderService } = await import("./orders.service.js");

const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const consumerId = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236903";
const driverId = "7e1d7b55-3f52-4d10-aac3-74387c236904";

function detailFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    consumer_id: consumerId,
    distributor_id: distributorId,
    driver_id: driverId,
    status: OrderStatus.OUT_FOR_DELIVERY,
    created_at: new Date("2026-06-01T10:00:00.000Z"),
    updated_at: new Date("2026-06-01T10:00:00.000Z"),
    delivery_date: new Date("2026-06-02T00:00:00.000Z"),
    delivery_window: DeliveryWindow.MORNING,
    subtotal_cents: 2500,
    deposit_cents: 1000,
    total_cents: 3500,
    nps_score: null,
    nps_comment: null,
    subscription_delivery_date: null,
    consumer: { name: "Cliente Teste", email: "cliente@xua.com.br", phone: "(32) 90000-0000" },
    address: {
      street: "Rua Teste",
      number: "10",
      complement: null,
      neighborhood: "Centro",
      city: "Juiz de Fora",
      state: "MG",
      zip_code: "36000-000",
    },
    distributor: { name: "Distribuidora Teste", phone: "(32) 91111-1111", email: "dist@xua.com.br" },
    zone: { name: "Zona 1" },
    time_slot: null,
    driver: { name: "Motorista Teste", phone: "(32) 92222-2222" },
    items: [
      {
        product_name: "Galão 20L",
        quantity: 1,
        unit_price_cents: 2500,
        subtotal_cents: 2500,
        product: { image_url: null },
      },
    ],
    payments: [],
    deposits: [],
    otps: [],
    audit_events: [],
    ...overrides,
  };
}

describe("orderService.getOrderDetail — exposição do código OTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderRepository.findByIdWithDetails.mockResolvedValue(detailFixture());
    mocks.redisGet.mockResolvedValue("123456");
  });

  it("inclui otp_code para o consumidor dono do pedido", async () => {
    const detail = await orderService.getOrderDetail(orderId, "consumer");

    expect(detail?.otp_code).toBe("123456");
    expect(mocks.redisGet).toHaveBeenCalledWith(`otp:${orderId}`);
  });

  it("NÃO inclui otp_code para o motorista, mesmo sendo o motorista designado", async () => {
    const detail = await orderService.getOrderDetail(orderId, "driver");

    expect(detail?.otp_code).toBeUndefined();
    expect(mocks.redisGet).not.toHaveBeenCalled();
  });

  it("NÃO inclui otp_code para distributor_admin", async () => {
    const detail = await orderService.getOrderDetail(orderId, "distributor_admin");

    expect(detail?.otp_code).toBeUndefined();
  });

  it("NÃO inclui otp_code para ops/support (override não exige leitura do código)", async () => {
    const detailOps = await orderService.getOrderDetail(orderId, "ops");
    const detailSupport = await orderService.getOrderDetail(orderId, "support");

    expect(detailOps?.otp_code).toBeUndefined();
    expect(detailSupport?.otp_code).toBeUndefined();
  });
});

describe("orderService.submitRating — bloqueio de reenvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({}));
    mocks.orderRepository.update.mockResolvedValue(detailFixture({ status: OrderStatus.DELIVERED, nps_score: 5 }));
  });

  it("aceita a primeira avaliação de um pedido entregue", async () => {
    mocks.orderRepository.findById.mockResolvedValue(
      detailFixture({ status: OrderStatus.DELIVERED, nps_score: null })
    );

    await orderService.submitRating(orderId, consumerId, 5, "Ótimo serviço");

    expect(mocks.orderRepository.update).toHaveBeenCalledWith(
      orderId,
      { nps_score: 5, nps_comment: "Ótimo serviço" },
      expect.anything()
    );
  });

  it("rejeita reenvio com ALREADY_RATED quando nps_score já está preenchido", async () => {
    mocks.orderRepository.findById.mockResolvedValue(
      detailFixture({ status: OrderStatus.DELIVERED, nps_score: 4 })
    );

    await expect(orderService.submitRating(orderId, consumerId, 1, "Mudei de ideia")).rejects.toMatchObject({
      code: "ALREADY_RATED",
    });
    expect(mocks.orderRepository.update).not.toHaveBeenCalled();
  });

  it("continua bloqueando avaliação de pedido não entregue (regra pré-existente)", async () => {
    mocks.orderRepository.findById.mockResolvedValue(
      detailFixture({ status: OrderStatus.OUT_FOR_DELIVERY, nps_score: null })
    );

    await expect(orderService.submitRating(orderId, consumerId, 5)).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
  });

  it("continua bloqueando avaliação de pedido de outro consumidor (IDOR)", async () => {
    mocks.orderRepository.findById.mockResolvedValue(
      detailFixture({ status: OrderStatus.DELIVERED, nps_score: null })
    );

    await expect(
      orderService.submitRating(orderId, "outro-consumidor-id", 5)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
