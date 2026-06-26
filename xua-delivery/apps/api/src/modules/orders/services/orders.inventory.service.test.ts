import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  AuditEventType,
  DeliveryWindow,
  InventoryMovementType,
  InventoryReferenceType,
  OrderStatus,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";

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
    socketEmit: vi.fn(),
    socketTo: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    orderRepository: {
      findById: vi.fn(),
      findByIdWithItemsForUpdate: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      findItemsByOrderId: vi.fn(),
    },
    auditRepository: { emit: vi.fn() },
    inventoryRepository: {
      findActiveInventoryItemsByProductIds: vi.fn(),
      findActiveReturnableEmptyItem: vi.fn(),
      findActiveReturnableFullItem: vi.fn(),
      findBalanceForUpdate: vi.fn(),
    },
    inventoryService: { applyMovement: vi.fn() },
    notificationService: { send: vi.fn() },
    paymentService: { charge: vi.fn() },
    distributorRepository: { resolveDistributorId: vi.fn(), findDriversByDistributor: vi.fn() },
    otpService: { generateInTx: vi.fn(), cacheCode: vi.fn() },
    enqueueRefundPaymentJob: vi.fn(),
  };
});

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../../../infra/socket/gateway.js", () => ({
  getIO: () => ({ to: mocks.socketTo }),
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}));

vi.mock("../../../infra/redis/client.js", () => ({
  default: { get: vi.fn() },
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
    resolveBottleGroups: vi.fn(async () => []),
    settlePerBottle: vi.fn(async () => []),
    settleDelivery: vi.fn(async () => ({ loaned: 0, returnedFromLoan: 0 })),
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

vi.mock("../../../infra/queue/payment-jobs.producer.js", () => ({
  enqueueRefundPaymentJob: mocks.enqueueRefundPaymentJob,
}));

const { orderService, OrderServiceError } = await import("./orders.service.js");

const tx = { tx: true, orderItem: { findMany: vi.fn() }, payment: { findFirst: vi.fn(), update: vi.fn() } };
const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236801";
const consumerId = "7e1d7b55-3f52-4d10-aac3-74387c236802";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236803";
const distributorUserId = "7e1d7b55-3f52-4d10-aac3-74387c236804";
const driverId = "7e1d7b55-3f52-4d10-aac3-74387c236805";
const zoneId = "7e1d7b55-3f52-4d10-aac3-74387c236806";
const productA = "7e1d7b55-3f52-4d10-aac3-74387c236807";
const productB = "7e1d7b55-3f52-4d10-aac3-74387c236808";
const itemA = "7e1d7b55-3f52-4d10-aac3-74387c236809";
const itemB = "7e1d7b55-3f52-4d10-aac3-74387c236810";
const emptyItemId = "7e1d7b55-3f52-4d10-aac3-74387c236811";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    consumer_id: consumerId,
    distributor_id: distributorId,
    zone_id: zoneId,
    driver_id: driverId,
    status: OrderStatus.SENT_TO_DISTRIBUTOR,
    delivery_date: new Date("2026-05-28T00:00:00.000Z"),
    delivery_window: DeliveryWindow.MORNING,
    time_slot_id: null,
    items: [
      {
        id: "order-item-a1",
        product_id: productA,
        product_name: "Agua 20L",
        quantity: 1,
        unit_price_cents: 1200,
        subtotal_cents: 1200,
      },
      {
        id: "order-item-a2",
        product_id: productA,
        product_name: "Agua 20L",
        quantity: 2,
        unit_price_cents: 1200,
        subtotal_cents: 2400,
      },
      {
        id: "order-item-b1",
        product_id: productB,
        product_name: "Agua com gas 20L",
        quantity: 1,
        unit_price_cents: 1400,
        subtotal_cents: 1400,
      },
    ],
    ...overrides,
  } as any;
}

const inventoryItemA = {
  id: itemA,
  code: "WATER20L",
  name: "Agua 20L",
  type: "SELLABLE_PRODUCT",
  product_id: productA,
  is_active: true,
};

const inventoryItemB = {
  id: itemB,
  code: "SPARKLING20L",
  name: "Agua com gas 20L",
  type: "SELLABLE_PRODUCT",
  product_id: productB,
  is_active: true,
};

const emptyInventoryItem = {
  id: emptyItemId,
  code: "EMPTY20L",
  name: "Garrafao vazio 20L",
  type: "RETURNABLE_EMPTY",
  product_id: null,
  is_active: true,
};

function mockStatusUpdate(currentOrder: any) {
  mocks.orderRepository.updateStatus.mockImplementation(async (_id, status, extra) => ({
    ...currentOrder,
    status,
    ...(extra ?? {}),
  }));
}

function mockInventoryBalances(balancesByItem: Record<string, number | null>) {
  mocks.inventoryRepository.findBalanceForUpdate.mockImplementation(async (_distributorId, inventoryItemId) => {
    const quantity = balancesByItem[inventoryItemId];
    return quantity == null ? null : { inventory_item_id: inventoryItemId, quantity_on_hand: quantity };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  tx.orderItem.findMany.mockResolvedValue([]);
  tx.payment.findFirst.mockResolvedValue(null);
  mocks.orderRepository.findItemsByOrderId.mockResolvedValue([]);
  mocks.socketTo.mockReturnValue({ emit: mocks.socketEmit });
  mocks.inventoryRepository.findActiveInventoryItemsByProductIds.mockResolvedValue([
    inventoryItemA,
    inventoryItemB,
  ]);
  mocks.inventoryRepository.findActiveReturnableEmptyItem.mockResolvedValue(emptyInventoryItem);
  mockInventoryBalances({ [itemA]: 10, [itemB]: 10 });
  mocks.inventoryService.applyMovement.mockResolvedValue({ idempotentReplay: false });
  mocks.notificationService.send.mockResolvedValue(undefined);
  mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
  mocks.distributorRepository.findDriversByDistributor.mockResolvedValue([{ id: driverId, name: "Motorista" }]);

  mocks.auditRepository.emit.mockResolvedValue({ id: "audit-1" });
  mocks.otpService.generateInTx.mockResolvedValue("123456");
  mocks.otpService.cacheCode.mockResolvedValue(undefined);
  mocks.enqueueRefundPaymentJob.mockResolvedValue({ id: "job-1", name: "refund-payment", correlationId: "corr-1" });
});

describe("orderService inventory integration", () => {
  it("aceita pedido com saldo suficiente e baixa itens agregados na mesma transacao", async () => {
    const current = order();
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mockStatusUpdate(current);

    const result = await orderService.acceptOrder(orderId, distributorUserId);

    expect(result.status).toBe(OrderStatus.ACCEPTED_BY_DISTRIBUTOR);
    expect(mocks.inventoryRepository.findBalanceForUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(mocks.inventoryService.applyMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        distributorId,
        inventoryItemId: itemA,
        quantityDelta: -3,
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        reference: { type: InventoryReferenceType.ORDER, id: orderId },
        metadata: expect.objectContaining({
          origin: "order_acceptance",
          order_id: orderId,
          product_id: productA,
          quantity: 3,
        }),
      }),
      tx
    );
    expect(mocks.inventoryService.applyMovement).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ inventoryItemId: itemB, quantityDelta: -1 }),
      tx
    );
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
        payload: expect.objectContaining({
          inventory_movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
        }),
      }),
      tx
    );
  });

  it("reprocessa aceite quando ledger retorna replay idempotente", async () => {
    const current = order();
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mocks.inventoryService.applyMovement.mockResolvedValue({ idempotentReplay: true });
    mockStatusUpdate(current);

    const result = await orderService.acceptOrder(orderId, distributorUserId);

    expect(result.status).toBe(OrderStatus.ACCEPTED_BY_DISTRIBUTOR);
    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
      { accepted_at: expect.any(Date) },
      tx
    );
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR }),
      tx
    );
  });

  it("nao altera status quando uma baixa de inventory falha dentro da transacao", async () => {
    const current = order();
    const inventoryError = new mocks.InventoryServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente");
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mocks.inventoryService.applyMovement
      .mockResolvedValueOnce({ idempotentReplay: false })
      .mockRejectedValueOnce(inventoryError);

    await expect(orderService.acceptOrder(orderId, distributorUserId)).rejects.toMatchObject({
      name: "OrderServiceError",
      code: "STOCK_UNAVAILABLE",
    });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).not.toHaveBeenCalled();
  });

  it("falha com STOCK_UNAVAILABLE sem alterar status quando saldo e insuficiente", async () => {
    const current = order({ items: [order().items[0]] });
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mocks.inventoryRepository.findActiveInventoryItemsByProductIds.mockResolvedValue([inventoryItemA]);
    mockInventoryBalances({ [itemA]: 0 });

    await expect(orderService.acceptOrder(orderId, distributorUserId)).rejects.toMatchObject({
      name: "OrderServiceError",
      code: "STOCK_UNAVAILABLE",
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).not.toHaveBeenCalled();
  });

  it("bloqueia pedido multi-item sem baixa parcial quando um item esta sem saldo", async () => {
    const current = order();
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mockInventoryBalances({ [itemA]: 10, [itemB]: 0 });

    await expect(orderService.acceptOrder(orderId, distributorUserId)).rejects.toBeInstanceOf(
      OrderServiceError
    );

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejeicao antes do aceite nao movimenta estoque", async () => {
    const current = order();
    mocks.orderRepository.findById.mockResolvedValue(current);
    mockStatusUpdate(current);

    await orderService.rejectOrder(orderId, distributorUserId, "out_of_stock", "Sem saldo fisico");

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.REJECTED_BY_DISTRIBUTOR,
      { cancellation_reason: "out_of_stock" },
      tx
    );
  });

  it("rejeicao com pagamento capturado dispara reembolso automatico", async () => {
    const current = order();
    mocks.orderRepository.findById.mockResolvedValue(current);
    mockStatusUpdate(current);
    tx.payment.findFirst.mockResolvedValue({ id: "payment-1", status: PaymentStatus.CAPTURED });

    await orderService.rejectOrder(orderId, distributorUserId, "out_of_stock", "Sem saldo fisico");

    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR,
        payload: expect.objectContaining({
          refund_auto_initiated: true,
          requires_manual_refund_review: false,
          payment_id: "payment-1",
        }),
      }),
      tx
    );
    expect(mocks.enqueueRefundPaymentJob).toHaveBeenCalledWith(orderId, "payment-1");
  });

  it("rejeicao com pagamento apenas autorizado (sem captura) so sinaliza revisao manual", async () => {
    const current = order();
    mocks.orderRepository.findById.mockResolvedValue(current);
    mockStatusUpdate(current);
    tx.payment.findFirst.mockResolvedValue({ id: "payment-2", status: PaymentStatus.AUTHORIZED });

    await orderService.rejectOrder(orderId, distributorUserId, "out_of_stock", "Sem saldo fisico");

    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR,
        payload: expect.objectContaining({
          refund_auto_initiated: false,
          requires_manual_refund_review: true,
          payment_id: "payment-2",
        }),
      }),
      tx
    );
    expect(mocks.enqueueRefundPaymentJob).not.toHaveBeenCalled();
  });

  it("cancelamento pos-aceite devolve saldo quando o item permanece disponivel", async () => {
    const current = order({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR });
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mockStatusUpdate(current);

    await orderService.cancelOrder(orderId, distributorUserId, "distributor", "Cliente cancelou");

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityDelta: 3,
        movementType: InventoryMovementType.ORDER_CANCEL_RETURN,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
        reference: { type: InventoryReferenceType.ORDER, id: orderId },
        metadata: expect.objectContaining({
          origin: "order_cancellation_return",
          previous_status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
          physical_return_confirmed: true,
        }),
      }),
      tx
    );

  });

  it("reprocessa cancelamento pos-aceite sem duplicar retorno no ledger", async () => {
    const current = order({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR });
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mocks.inventoryService.applyMovement.mockResolvedValue({ idempotentReplay: true });
    mockStatusUpdate(current);

    await orderService.cancelOrder(orderId, distributorUserId, "distributor", "Cliente cancelou");

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(mocks.inventoryService.applyMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        movementType: InventoryMovementType.ORDER_CANCEL_RETURN,
        reference: { type: InventoryReferenceType.ORDER, id: orderId },
      }),
      tx
    );
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.CANCELLED,
      { cancellation_reason: "Cliente cancelou" },
      tx
    );
  });

  it("cancelamento em rota por driver alegando retorno fisico NAO credita estoque", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mockStatusUpdate(current);

    await orderService.cancelOrder(orderId, driverId, "driver", "Motorista cancelou", {
      returnToStock: true,
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.ORDER_CANCELLED,
        payload: expect.objectContaining({ physical_return_confirmed: false }),
      }),
      tx
    );
  });

  it("cancelamento em rota por distribuidora confirmando retorno fisico credita estoque", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mockStatusUpdate(current);

    await orderService.cancelOrder(orderId, distributorUserId, "distributor", "Distribuidora cancelou", {
      returnToStock: true,
    });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: InventoryMovementType.ORDER_CANCEL_RETURN,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
      }),
      tx
    );
  });

  it("falha de entrega com retorno fisico confirmado devolve saldo", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
    mockStatusUpdate(current);

    await orderService.markDeliveryFailed(orderId, driverId, "Cliente ausente", {
      returnToStock: true,
    });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityDelta: 3,
        movementType: InventoryMovementType.DELIVERY_FAILED_RETURN,
        actor: { type: ActorType.DRIVER, id: driverId },
        sourceApp: SourceApp.DRIVER_WEB,
        metadata: expect.objectContaining({
          origin: "delivery_failed_return",
          reason: "Cliente ausente",
          physical_return_confirmed: true,
        }),
      }),
      tx
    );
  });

  it("troca com retorno de vazio preserva campos legados e cria EMPTY_RETURN_IN", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findById.mockResolvedValue(current);
    mocks.orderRepository.update.mockResolvedValue({ ...current, returned_empty_qty: 2 });

    await orderService.recordBottleExchange(orderId, driverId, {
      collectedQty: 2,
      returnedQty: 2,
      condition: "ok",
    });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        distributorId,
        inventoryItemId: emptyItemId,
        quantityDelta: 2,
        movementType: InventoryMovementType.EMPTY_RETURN_IN,
        actor: { type: ActorType.DRIVER, id: driverId },
        reference: { type: InventoryReferenceType.ORDER, id: orderId },
      }),
      tx
    );
    expect(mocks.orderRepository.update).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({ returned_empty_qty: 2, bottle_condition: "ok" }),
      tx
    );
  });

  it("troca com quantidade zero nao movimenta retornavel", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findById.mockResolvedValue(current);
    mocks.orderRepository.update.mockResolvedValue({ ...current, returned_empty_qty: 0 });

    await orderService.recordBottleExchange(orderId, driverId, {
      collectedQty: 0,
      returnedQty: 0,
      condition: "ok",
    });

    expect(mocks.inventoryRepository.findActiveReturnableEmptyItem).not.toHaveBeenCalled();
    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it("empty-not-collected preserva motivo operacional sem entrada no ledger", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findById.mockResolvedValue(current);
    mocks.orderRepository.update.mockResolvedValue({ ...current, empty_not_collected_reason: "other" });

    await orderService.recordEmptyNotCollected(orderId, driverId, {
      reason: "other",
      notes: "Cliente sem vasilhame disponivel",
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.EMPTY_NOT_COLLECTED }),
      tx
    );
  });

  it("repeticao da mesma troca usa a mesma referencia idempotente do pedido", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findById.mockResolvedValue(current);
    mocks.orderRepository.update.mockResolvedValue({ ...current, returned_empty_qty: 1 });
    mocks.inventoryService.applyMovement
      .mockResolvedValueOnce({ idempotentReplay: false })
      .mockResolvedValueOnce({ idempotentReplay: true });

    await orderService.recordBottleExchange(orderId, driverId, {
      collectedQty: 1,
      returnedQty: 1,
      condition: "ok",
    });
    await orderService.recordBottleExchange(orderId, driverId, {
      collectedQty: 1,
      returnedQty: 1,
      condition: "ok",
    });

    expect(mocks.inventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(mocks.inventoryService.applyMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ reference: { type: InventoryReferenceType.ORDER, id: orderId } }),
      tx
    );
    expect(mocks.inventoryService.applyMovement).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ reference: { type: InventoryReferenceType.ORDER, id: orderId } }),
      tx
    );
  });

  it("bloqueia dispatch quando motorista nao pertence a distribuidora", async () => {
    mocks.distributorRepository.findDriversByDistributor.mockResolvedValue([]);

    await expect(orderService.dispatch(orderId, distributorUserId, driverId)).rejects.toMatchObject({
      name: "OrderServiceError",
      code: "DRIVER_NOT_FOUND",
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("bloqueia reatribuicao de motorista quando pedido ja esta em rota", async () => {
    const current = order({ status: OrderStatus.OUT_FOR_DELIVERY });
    mocks.orderRepository.findById.mockResolvedValue(current);

    await expect(orderService.assignDriver(orderId, distributorUserId, driverId)).rejects.toMatchObject({
      name: "OrderServiceError",
      code: "INVALID_STATUS",
    });

    expect(mocks.orderRepository.update).not.toHaveBeenCalled();
  });

  it("bloqueia dispatch de pedido de outra distribuidora", async () => {
    const current = order({ status: OrderStatus.READY_FOR_DISPATCH, distributor_id: "other-distributor" });
    mocks.orderRepository.findById.mockResolvedValue(current);

    await expect(orderService.dispatch(orderId, distributorUserId, driverId)).rejects.toMatchObject({
      name: "OrderServiceError",
      code: "FORBIDDEN",
    });

    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("bloqueia dispatchWithChecklist quando pedido nao esta aceito", async () => {
    const current = order({ status: OrderStatus.READY_FOR_DISPATCH });
    mocks.orderRepository.findById.mockResolvedValue(current);

    await expect(orderService.dispatchWithChecklist(orderId, distributorUserId, driverId)).rejects.toMatchObject({
      name: "OrderServiceError",
      code: "INVALID_STATUS",
    });

    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("registra atribuicao de motorista no dispatchWithChecklist quando driver muda", async () => {
    const current = order({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR, driver_id: null });
    mocks.orderRepository.findById.mockResolvedValue(current);
    mockStatusUpdate(current);

    const result = await orderService.dispatchWithChecklist(orderId, distributorUserId, driverId);

    expect(result.order.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(result.otpCode).toBe("123456");
    expect(mocks.otpService.generateInTx).toHaveBeenCalledWith(orderId, distributorUserId, tx);
    expect(mocks.otpService.cacheCode).toHaveBeenCalledWith(orderId, "123456");
    expect(mocks.orderRepository.updateStatus).toHaveBeenNthCalledWith(
      1,
      orderId,
      OrderStatus.READY_FOR_DISPATCH,
      undefined,
      tx
    );
    expect(mocks.orderRepository.updateStatus).toHaveBeenNthCalledWith(
      2,
      orderId,
      OrderStatus.OUT_FOR_DELIVERY,
      { dispatched_at: expect.any(Date), driver_id: driverId },
      tx
    );
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.ORDER_DRIVER_ASSIGNED,
        payload: expect.objectContaining({ action: "dispatch_with_checklist", driverId, previous_driver_id: null }),
      }),
      tx
    );
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: AuditEventType.ORDER_DISPATCHED }),
      tx
    );
  });
});
