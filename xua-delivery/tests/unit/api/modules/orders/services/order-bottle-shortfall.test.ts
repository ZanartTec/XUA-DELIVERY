import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuditEventType,
  DeliveryWindow,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
} from "@xua/shared/enums";

/**
 * Regra de vasilhame na entrega (refil): o pedido nasce cobrando só a água e o
 * motorista resolve os vazios que faltaram — cobrar o vasilhame na porta ou
 * entregar parcial. O cancelamento é o fluxo de falha de entrega.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  orderRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    findItemsByOrderId: vi.fn(),
    createItems: vi.fn(),
  },
  auditRepository: { emit: vi.fn() },
  inventoryRepository: {
    findActiveReturnableEmptyItem: vi.fn(),
    findActiveInventoryItemsByProductIds: vi.fn(),
  },
  inventoryService: { applyMovement: vi.fn() },
  depositSettlementService: { settleDelivery: vi.fn() },
  orderEventsPublisher: { notifyConsumer: vi.fn(), notifyDistributor: vi.fn() },
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
vi.mock("@api/modules/inventory/repository/inventory.repository.js", () => ({
  inventoryRepository: mocks.inventoryRepository,
}));
vi.mock("@api/modules/inventory/services/inventory.service.js", () => ({
  inventoryService: mocks.inventoryService,
}));
vi.mock("@api/modules/deposits/services/deposit-settlement.service.js", () => ({
  depositSettlementService: mocks.depositSettlementService,
}));
vi.mock("@api/modules/orders/services/order-events.publisher.js", () => ({
  orderEventsPublisher: mocks.orderEventsPublisher,
}));
vi.mock("@api/modules/orders/services/order-inventory.helpers.js", () => ({
  translateInventoryError: (error: unknown) => {
    throw error;
  },
}));

const { orderBottleService } = await import("@api/modules/orders/services/order-bottle.service.js");

const orderId = "6d3c9f20-3333-4c00-9000-000000000001";
const driverId = "6d3c9f20-3333-4c00-9000-000000000002";
const distributorId = "6d3c9f20-3333-4c00-9000-000000000003";
const waterId = "6d3c9f20-3333-4c00-9000-000000000004";
const bottleId = "6d3c9f20-3333-4c00-9000-000000000005";
const bottleInventoryId = "6d3c9f20-3333-4c00-9000-000000000006";
const waterInventoryId = "6d3c9f20-3333-4c00-9000-000000000007";

const tx = {
  payment: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  orderItem: { findMany: vi.fn(), update: vi.fn() },
};

/** 2 águas refil a R$ 20; vasilhame faltante a R$ 30. */
function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: orderId,
    consumer_id: "6d3c9f20-3333-4c00-9000-000000000008",
    distributor_id: distributorId,
    driver_id: driverId,
    status: OrderStatus.OUT_FOR_DELIVERY,
    delivery_date: new Date("2026-11-05T00:00:00.000Z"),
    delivery_window: DeliveryWindow.MORNING,
    subtotal_cents: 4000,
    total_cents: 4000,
    bottles_full_ordered: 2,
    max_bottle_charge_cents: 6000,
    bottles_sold: 0,
    bottle_charge_cents: 0,
    bottle_step_recorded_at: null,
    ...overrides,
  };
}

function settlement(sold: number) {
  return {
    bottleProductId: bottleId,
    bottleProductName: "Vasilhame 20L",
    bottleInventoryItemId: bottleInventoryId,
    bottleUnitPriceCents: 3000,
    bottlesOrdered: 2,
    emptiesProvided: 2 - sold,
    missing: sold,
    sold,
    loaned: 0,
  };
}

function offlinePayment(amount = 4000) {
  return { id: "pay-1", status: PaymentStatus.CREATED, amount_cents: amount, provider: "local" };
}

function exchange(collectedQty: number, extra: Record<string, unknown> = {}) {
  return orderBottleService.recordBottleExchange(orderId, driverId, {
    collectedQty,
    returnedQty: collectedQty,
    condition: "ok",
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  mocks.orderRepository.findById.mockResolvedValue(order());
  mocks.orderRepository.update.mockImplementation(async (_id, data) => ({ ...order(), ...data }));
  mocks.orderRepository.findItemsByOrderId.mockResolvedValue([{ product_id: waterId, quantity: 2 }]);
  mocks.inventoryRepository.findActiveReturnableEmptyItem.mockResolvedValue(null);
  mocks.inventoryService.applyMovement.mockResolvedValue({ idempotentReplay: false });
  tx.payment.findFirst.mockResolvedValue(offlinePayment());
  tx.orderItem.findMany.mockResolvedValue([
    {
      id: "item-1",
      product_id: waterId,
      quantity: 2,
      original_quantity: null,
      unit_price_cents: 2000,
      product: { requires_empty_return: true, bottle_product_id: bottleId },
    },
  ]);
  mocks.inventoryRepository.findActiveInventoryItemsByProductIds.mockResolvedValue([
    { id: waterInventoryId, product_id: waterId },
  ]);
});

describe("regra de vasilhame na entrega", () => {
  it("todos os vazios devolvidos: nada a ajustar no valor", async () => {
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(0)],
    });

    await exchange(2);

    expect(mocks.orderRepository.createItems).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(
      mocks.auditRepository.emit.mock.calls.some(
        ([p]) => p.eventType === AuditEventType.ORDER_PRICING_FINALIZED
      )
    ).toBe(false);
  });

  it("faltou vazio e o motorista não escolheu como resolver: recusa", async () => {
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(1)],
    });

    await expect(exchange(1)).rejects.toMatchObject({ code: "BOTTLE_SHORTFALL_RESOLUTION_REQUIRED" });
  });

  it("cobrar na porta: vasilhame vira item, baixa estoque e soma ao pagamento (R$ 40 → R$ 70)", async () => {
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(1)],
    });

    await exchange(1, { shortfallResolution: "charge" });

    expect(mocks.orderRepository.createItems).toHaveBeenCalledWith(
      orderId,
      [{ product_id: bottleId, product_name: "Vasilhame 20L", unit_price_cents: 3000, quantity: 1 }],
      tx
    );
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: bottleInventoryId,
        quantityDelta: -1,
        movementType: InventoryMovementType.BOTTLE_SALE_OUT,
      }),
      tx
    );
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { amount_cents: 7000 },
    });
    expect(mocks.orderRepository.update).toHaveBeenCalledWith(
      orderId,
      { bottles_sold: 1, bottle_charge_cents: 3000, total_cents: 7000 },
      tx
    );
  });

  it("pedido pago online: a cobrança do vasilhame vira pagamento avulso na porta", async () => {
    tx.payment.findFirst.mockResolvedValue(null);
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(2)],
    });

    await exchange(0, { shortfallResolution: "charge", extraPaymentMethod: "card_on_delivery" });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        order_id: orderId,
        status: PaymentStatus.CREATED,
        amount_cents: 6000,
        payment_method: "card_on_delivery",
        provider: "local",
      }),
    });
  });

  it("entrega parcial: tira a água sem vazio, devolve ao estoque e reduz o valor (R$ 40 → R$ 20)", async () => {
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(1)],
    });

    await exchange(1, { shortfallResolution: "partial" });

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { quantity: 1, original_quantity: 2, subtotal_cents: 2000 },
    });
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: waterInventoryId,
        quantityDelta: 1,
        movementType: InventoryMovementType.PARTIAL_DELIVERY_RETURN,
      }),
      tx
    );
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { amount_cents: 2000 },
    });
    expect(mocks.orderRepository.update).toHaveBeenCalledWith(
      orderId,
      { subtotal_cents: 2000, total_cents: 2000, bottles_full_ordered: 1 },
      tx
    );
  });

  it("entrega parcial não é permitida em pedido pago online (exigiria estorno)", async () => {
    tx.payment.findFirst.mockResolvedValue(null);
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(1)],
    });

    await expect(exchange(1, { shortfallResolution: "partial" })).rejects.toMatchObject({
      code: "PARTIAL_DELIVERY_NOT_ALLOWED",
    });
  });

  it("entrega parcial sem nenhum vazio não sobra nada a entregar: manda registrar a falha", async () => {
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(2)],
    });

    await expect(exchange(0, { shortfallResolution: "partial" })).rejects.toMatchObject({
      code: "PARTIAL_DELIVERY_EMPTY",
    });
  });

  it("correção de pedido já entregue não mexe mais no valor", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ status: OrderStatus.DELIVERED }));
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(1)],
    });

    await exchange(1);

    expect(mocks.orderRepository.createItems).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it("pedido anterior à regra (vasilhame já cobrado na criação, teto 0) não é cobrado de novo", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ max_bottle_charge_cents: 0 }));
    mocks.depositSettlementService.settleDelivery.mockResolvedValue({
      loaned: 0,
      returnedFromLoan: 0,
      settled: [settlement(2)],
    });

    await exchange(0);

    expect(mocks.orderRepository.createItems).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("não-coleta sem contagem é recusada em pedido com refil", async () => {
    await expect(
      orderBottleService.recordEmptyNotCollected(orderId, driverId, { reason: "client_absent" })
    ).rejects.toMatchObject({ code: "BOTTLE_COUNT_REQUIRED" });
  });
});
