import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  AuditEventType,
  DeliveryWindow,
  InventoryMovementType,
  InventoryReferenceType,
  OrderStatus,
  SourceApp,
} from "@xua/shared/enums";

/**
 * Testes de caracterização de orderBottleService.
 *
 * Fixam o comportamento ATUAL do registro de vasilhame antes das mudanças
 * planejadas para o módulo do motorista. Vários casos documentam comportamento
 * SABIDAMENTE ERRADO, marcado com comentário do que muda e em qual fase.
 *
 * Diferença deliberada em relação a orders.inventory.service.test.ts: lá o
 * depositSettlementService é mockado e nunca verificado, e é exatamente por
 * isso que o vazamento de settlement passou despercebido. Aqui ele é mockado
 * (é teste unitário) mas TODAS as chamadas são asseridas.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  orderRepository: {
    findById: vi.fn(),
    findByIdWithItemsForUpdate: vi.fn(),
    update: vi.fn(),
    findItemsByOrderId: vi.fn(),
  },
  auditRepository: { emit: vi.fn() },
  inventoryRepository: { findActiveReturnableEmptyItem: vi.fn() },
  inventoryService: { applyMovement: vi.fn() },
  depositSettlementService: { settleDelivery: vi.fn() },
  orderEventsPublisher: {
    notifyConsumer: vi.fn(),
    notifyDistributor: vi.fn(),
    distributorOrderStatusChanged: vi.fn(),
  },
  translateInventoryError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
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
}));

vi.mock("../../deposits/services/deposit-settlement.service.js", () => ({
  depositSettlementService: mocks.depositSettlementService,
}));

vi.mock("./order-events.publisher.js", () => ({
  orderEventsPublisher: mocks.orderEventsPublisher,
}));

vi.mock("./order-inventory.helpers.js", () => ({
  translateInventoryError: mocks.translateInventoryError,
}));

const { orderBottleService } = await import("./order-bottle.service.js");
const { OrderServiceError } = await import("../errors.js");

const orderId = "5c2b8e10-2222-4b00-9000-000000000001";
const consumerId = "5c2b8e10-2222-4b00-9000-000000000002";
const distributorId = "5c2b8e10-2222-4b00-9000-000000000003";
const driverId = "5c2b8e10-2222-4b00-9000-000000000004";
const otherDriverId = "5c2b8e10-2222-4b00-9000-000000000005";
const emptyItemId = "5c2b8e10-2222-4b00-9000-000000000006";
const productId = "5c2b8e10-2222-4b00-9000-000000000007";

const tx = { tx: true };

const emptyInventoryItem = {
  id: emptyItemId,
  code: "EMPTY20L",
  name: "Garrafao vazio 20L",
  type: "RETURNABLE_EMPTY",
  product_id: null,
  is_active: true,
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    consumer_id: consumerId,
    distributor_id: distributorId,
    driver_id: driverId,
    status: OrderStatus.OUT_FOR_DELIVERY,
    delivery_date: new Date("2026-06-01T00:00:00.000Z"),
    delivery_window: DeliveryWindow.MORNING,
    collected_empty_qty: 0,
    returned_empty_qty: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: any) => callback(tx));
  mocks.orderRepository.update.mockImplementation(async (_id, data) => ({ ...order(), ...data }));
  mocks.orderRepository.findItemsByOrderId.mockResolvedValue([
    { product_id: productId, quantity: 3 },
  ]);
  mocks.inventoryRepository.findActiveReturnableEmptyItem.mockResolvedValue(emptyInventoryItem);
  mocks.inventoryService.applyMovement.mockResolvedValue({ idempotentReplay: false });
  mocks.depositSettlementService.settleDelivery.mockResolvedValue({
    loaned: 0,
    returnedFromLoan: 0,
  });
});

describe("orderBottleService.recordBottleExchange", () => {
  it("grava as quantidades e a condição do vasilhame", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordBottleExchange(orderId, driverId, {
      collectedQty: 3,
      returnedQty: 2,
      condition: "ok",
    });

    expect(mocks.orderRepository.update).toHaveBeenCalledWith(
      orderId,
      { collected_empty_qty: 3, returned_empty_qty: 2, bottle_condition: "ok" },
      tx
    );
  });

  it("recusa motorista que não é o dono do pedido", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ driver_id: otherDriverId }));

    await expect(
      orderBottleService.recordBottleExchange(orderId, driverId, {
        collectedQty: 1,
        returnedQty: 1,
        condition: "ok",
      })
    ).rejects.toThrow(OrderServiceError);
    expect(mocks.orderRepository.update).not.toHaveBeenCalled();
  });

  it("recusa pedido inexistente", async () => {
    mocks.orderRepository.findById.mockResolvedValue(null);

    await expect(
      orderBottleService.recordBottleExchange(orderId, driverId, {
        collectedQty: 1,
        returnedQty: 1,
        condition: "ok",
      })
    ).rejects.toThrow(OrderServiceError);
  });

  it("dá entrada no estoque de retornáveis quando há vazio devolvido", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordBottleExchange(orderId, driverId, {
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
        reference: { type: InventoryReferenceType.ORDER, id: orderId },
      }),
      tx
    );
  });

  it("segue adiante e apenas registra aviso quando não há item retornável ativo", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());
    mocks.inventoryRepository.findActiveReturnableEmptyItem.mockResolvedValue(null);

    await orderBottleService.recordBottleExchange(orderId, driverId, {
      collectedQty: 2,
      returnedQty: 2,
      condition: "ok",
    });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalled();
    expect(mocks.orderRepository.update).toHaveBeenCalled();
  });

  it("liquida a caução com a contagem real da entrega, dentro da transação", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordBottleExchange(orderId, driverId, {
      collectedQty: 3,
      returnedQty: 2,
      condition: "ok",
    });

    expect(mocks.depositSettlementService.settleDelivery).toHaveBeenCalledWith(
      {
        orderId,
        distributorId,
        consumerId,
        items: [{ product_id: productId, quantity: 3 }],
        collectedEmpties: 3,
        actor: { type: ActorType.DRIVER, id: driverId },
        sourceApp: SourceApp.DRIVER_WEB,
      },
      tx
    );
  });

  it("emite BOTTLE_EXCHANGE_RECORDED dentro da transação", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordBottleExchange(orderId, driverId, {
      collectedQty: 3,
      returnedQty: 2,
      condition: "ok",
    });

    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.BOTTLE_EXCHANGE_RECORDED,
        actor: { type: ActorType.DRIVER, id: driverId },
        orderId,
        sourceApp: SourceApp.DRIVER_WEB,
      }),
      tx
    );
  });

  // COMPORTAMENTO A CORRIGIR (Fase 2 do plano): nenhuma validação de status.
  // Com a inversão das telas planejada, isso permitiria registrar vasilhame de
  // uma entrega que ainda vai falhar.
  it("hoje aceita o registro em QUALQUER status do pedido", async () => {
    for (const status of [
      OrderStatus.CREATED,
      OrderStatus.READY_FOR_DISPATCH,
      OrderStatus.DELIVERED,
      OrderStatus.DELIVERY_FAILED,
      OrderStatus.CANCELLED,
    ]) {
      vi.clearAllMocks();
      mocks.transaction.mockImplementation(async (callback: any) => callback(tx));
      mocks.orderRepository.update.mockResolvedValue(order({ status }));
      mocks.orderRepository.findItemsByOrderId.mockResolvedValue([]);
      mocks.inventoryRepository.findActiveReturnableEmptyItem.mockResolvedValue(null);
      mocks.depositSettlementService.settleDelivery.mockResolvedValue({
        loaned: 0,
        returnedFromLoan: 0,
      });
      mocks.orderRepository.findById.mockResolvedValue(order({ status }));

      await expect(
        orderBottleService.recordBottleExchange(orderId, driverId, {
          collectedQty: 1,
          returnedQty: 1,
          condition: "ok",
        })
      ).resolves.toBeDefined();
    }
  });

  // COMPORTAMENTO A CORRIGIR (Fase 4 do plano): nenhum evento de socket, então
  // a tela do consumidor e o painel da distribuidora não sabem da troca.
  it("hoje NÃO emite nenhum evento de socket", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordBottleExchange(orderId, driverId, {
      collectedQty: 3,
      returnedQty: 2,
      condition: "ok",
    });

    expect(mocks.orderEventsPublisher.notifyConsumer).not.toHaveBeenCalled();
    expect(mocks.orderEventsPublisher.notifyDistributor).not.toHaveBeenCalled();
    expect(mocks.orderEventsPublisher.distributorOrderStatusChanged).not.toHaveBeenCalled();
  });
});

describe("orderBottleService.recordEmptyNotCollected", () => {
  it("grava o motivo e as observações", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordEmptyNotCollected(orderId, driverId, {
      reason: "client_absent",
      notes: "Cliente não estava no endereço",
    });

    expect(mocks.orderRepository.update).toHaveBeenCalledWith(
      orderId,
      {
        empty_not_collected_reason: "client_absent",
        empty_not_collected_notes: "Cliente não estava no endereço",
      },
      tx
    );
  });

  it("recusa motorista que não é o dono do pedido", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ driver_id: otherDriverId }));

    await expect(
      orderBottleService.recordEmptyNotCollected(orderId, driverId, { reason: "client_absent" })
    ).rejects.toThrow(OrderServiceError);
    expect(mocks.orderRepository.update).not.toHaveBeenCalled();
  });

  it("emite EMPTY_NOT_COLLECTED dentro da transação", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordEmptyNotCollected(orderId, driverId, { reason: "no_access" });

    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.EMPTY_NOT_COLLECTED,
        actor: { type: ActorType.DRIVER, id: driverId },
        orderId,
        sourceApp: SourceApp.DRIVER_WEB,
        payload: { reason: "no_access" },
      }),
      tx
    );
  });

  it("não movimenta o estoque de retornáveis", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordEmptyNotCollected(orderId, driverId, { reason: "no_access" });

    expect(mocks.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  // COMPORTAMENTO A CORRIGIR (Fase 7.4 do plano) — O VAZAMENTO DE SETTLEMENT.
  // Não coletar vazio é exatamente o caso em que o vasilhame deveria ser
  // emprestado ao cliente, e é justamente aqui que a caução NÃO é liquidada.
  // Somado ao desvio de exchange/page.tsx (que pula para a tela de não-coleta
  // sem chamar a API quando a quantidade é zero), o único call site de
  // settleDelivery fica inalcançável no cenário que ele existe para cobrir.
  // Sem efeito prático hoje (programa de caução dormente), mas bloqueia a
  // ativação do programa.
  it("hoje NÃO liquida a caução — o vazamento de settlement", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordEmptyNotCollected(orderId, driverId, {
      reason: "no_empty_bottles",
    });

    expect(mocks.depositSettlementService.settleDelivery).not.toHaveBeenCalled();
  });

  // COMPORTAMENTO A CORRIGIR (Fase 4 do plano).
  it("hoje NÃO emite nenhum evento de socket", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await orderBottleService.recordEmptyNotCollected(orderId, driverId, { reason: "no_access" });

    expect(mocks.orderEventsPublisher.notifyConsumer).not.toHaveBeenCalled();
    expect(mocks.orderEventsPublisher.distributorOrderStatusChanged).not.toHaveBeenCalled();
  });
});
