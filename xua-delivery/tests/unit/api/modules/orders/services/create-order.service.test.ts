import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryWindow, OrderStatus, PaymentStatus } from "@xua/shared/enums";

/**
 * Criação de pedido:
 * - pagamento na entrega (dinheiro OU cartão na maquininha) nasce CONFIRMED e
 *   vai direto para a distribuidora — não espera o gateway online;
 * - regra de vasilhame na entrega: o pedido cobra só os produtos e registra a
 *   demanda de vazios + o teto da cobrança na porta.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  orderRepository: {
    create: vi.fn(),
    createItems: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
  auditRepository: { emit: vi.fn() },
  scheduleService: {
    validateDeliveryDate: vi.fn(),
    resolveScheduledTimeSnapshot: vi.fn(),
  },
  depositSettlementService: { resolveBottleGroups: vi.fn() },
  distributorGatewayService: { getPublicMethods: vi.fn() },
  orderEventsPublisher: { notifyDistributor: vi.fn() },
}));

vi.mock("@api/infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));
vi.mock("@api/infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@api/modules/orders/repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));
vi.mock("@api/modules/audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));
vi.mock("@api/modules/distributor/services/schedule.service.js", () => ({
  scheduleService: mocks.scheduleService,
}));
vi.mock("@api/modules/deposits/services/deposit-settlement.service.js", () => ({
  depositSettlementService: mocks.depositSettlementService,
}));
vi.mock("@api/modules/distributor-gateway/index.js", () => ({
  distributorGatewayService: mocks.distributorGatewayService,
  isPaymentMethodAllowed: () => true,
  DEFAULT_PUBLIC_PAYMENT_METHODS: {},
}));
vi.mock("@api/modules/orders/services/order-events.publisher.js", () => ({
  orderEventsPublisher: mocks.orderEventsPublisher,
}));

const { createOrderService } = await import("@api/modules/orders/services/create-order.service.js");

const waterId = "8a1b2c30-4444-4d00-9000-000000000001";
const bottleId = "8a1b2c30-4444-4d00-9000-000000000002";

const tx = { payment: { create: vi.fn() } };

function input(paymentMethod: "cash" | "card_on_delivery" | "pix") {
  return {
    consumerId: "8a1b2c30-4444-4d00-9000-000000000010",
    addressId: "8a1b2c30-4444-4d00-9000-000000000011",
    distributorId: "8a1b2c30-4444-4d00-9000-000000000012",
    zoneId: "8a1b2c30-4444-4d00-9000-000000000013",
    deliveryDate: "2026-11-06",
    deliveryWindow: DeliveryWindow.MORNING,
    distributorSelectionMode: "manual" as const,
    paymentMethod,
    items: [{ product_id: waterId, product_name: "Água 20L", unit_price_cents: 2000, quantity: 2 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  mocks.scheduleService.validateDeliveryDate.mockResolvedValue(undefined);
  mocks.scheduleService.resolveScheduledTimeSnapshot.mockResolvedValue({
    timeSlotId: null,
    label: null,
    startHour: null,
    startMinute: null,
    endHour: null,
    endMinute: null,
  });
  mocks.distributorGatewayService.getPublicMethods.mockResolvedValue({});
  mocks.depositSettlementService.resolveBottleGroups.mockResolvedValue([
    {
      bottleProductId: bottleId,
      bottleProductName: "Vasilhame 20L",
      bottleInventoryItemId: null,
      bottleUnitPriceCents: 3000,
      bottlesOrdered: 2,
    },
  ]);
  mocks.orderRepository.create.mockImplementation(async (data) => ({ id: "order-1", ...data }));
  tx.payment.create.mockResolvedValue({ id: "pay-1" });
  mocks.orderRepository.findById.mockImplementation(async () => ({
    id: "order-1",
    status: OrderStatus.CONFIRMED,
    distributor_id: input("cash").distributorId,
  }));
  mocks.orderRepository.updateStatus.mockImplementation(async (id, status) => ({
    id,
    status,
    distributor_id: input("cash").distributorId,
  }));
});

describe("createOrderService.createOrder", () => {
  it("cobra só a água e registra demanda de vazios + teto da cobrança na porta", async () => {
    await createOrderService.createOrder(input("cash"));

    expect(mocks.orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal_cents: 4000,
        total_cents: 4000,
        bottles_full_ordered: 2,
        bottles_sold: 0,
        max_bottle_charge_cents: 6000,
        bottle_charge_cents: 0,
      }),
      tx
    );
    expect(mocks.orderRepository.createItems).toHaveBeenCalledWith("order-1", input("cash").items, tx);
  });

  it("cartão na entrega nasce CONFIRMED, registra pagamento na porta e vai para a distribuidora", async () => {
    const result = await createOrderService.createOrder(input("card_on_delivery"));

    expect(mocks.orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.CONFIRMED }),
      tx
    );
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: PaymentStatus.CREATED,
        amount_cents: 4000,
        payment_method: "card_on_delivery",
        provider: "local",
        cash_change_for_cents: null,
      }),
    });
    expect(result.status).toBe(OrderStatus.SENT_TO_DISTRIBUTOR);
    expect(mocks.orderEventsPublisher.notifyDistributor).toHaveBeenCalled();
  });

  it("pagamento online continua aguardando o gateway", async () => {
    const result = await createOrderService.createOrder(input("pix"));

    expect(mocks.orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.CREATED }),
      tx
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.CREATED);
  });
});
