import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActorType,
  AuditEventType,
  DeliveryWindow,
  OrderStatus,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";

/**
 * Testes de caracterização de deliverOrderService.
 *
 * Fixam o comportamento ATUAL dos três desfechos da entrega (sucesso, falha,
 * reagendamento) antes das mudanças planejadas para o módulo do motorista.
 * Vários casos aqui documentam comportamento que É SABIDAMENTE ERRADO e será
 * corrigido — cada um está marcado com um comentário explicando o que muda e
 * quando. Quando a correção chegar, o teste deve FALHAR e ser atualizado de
 * forma consciente; é exatamente esse o ponto.
 *
 * Cobertura complementar (não duplicar aqui): orders.inventory.service.test.ts
 * já cobre a devolução de estoque em markDeliveryFailed.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  orderRepository: {
    findById: vi.fn(),
    findByIdWithItemsForUpdate: vi.fn(),
    updateStatus: vi.fn(),
  },
  auditRepository: { emit: vi.fn() },
  notificationService: { send: vi.fn() },
  orderEventsPublisher: {
    notifyConsumer: vi.fn(),
    notifyDistributor: vi.fn(),
    notifyDriver: vi.fn(),
    distributorOrderStatusChanged: vi.fn(),
  },
  subscriptionSettlementService: { settleDelivered: vi.fn() },
  resolveOrderInventoryLines: vi.fn(),
  applyOrderInventoryMovements: vi.fn(),
  inventoryAuditLines: vi.fn(),
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));

vi.mock("../../audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

vi.mock("../../notifications/services/notification.service.js", () => ({
  notificationService: mocks.notificationService,
}));

vi.mock("./order-events.publisher.js", () => ({
  orderEventsPublisher: mocks.orderEventsPublisher,
}));

vi.mock("./order-inventory.helpers.js", () => ({
  resolveOrderInventoryLines: mocks.resolveOrderInventoryLines,
  applyOrderInventoryMovements: mocks.applyOrderInventoryMovements,
  inventoryAuditLines: mocks.inventoryAuditLines,
}));

vi.mock("../../user-subscriptions/services/subscription-settlement.service.js", () => ({
  subscriptionSettlementService: mocks.subscriptionSettlementService,
}));

// A máquina de estados e OrderServiceError NÃO são mockadas — queremos a
// validação de transição real.
const { deliverOrderService } = await import("./deliver-order.service.js");
const { OrderServiceError } = await import("../errors.js");

const orderId = "3f9a1c40-1111-4a00-9000-000000000001";
const consumerId = "3f9a1c40-1111-4a00-9000-000000000002";
const distributorId = "3f9a1c40-1111-4a00-9000-000000000003";
const driverId = "3f9a1c40-1111-4a00-9000-000000000004";
const zoneId = "3f9a1c40-1111-4a00-9000-000000000005";
const opsUserId = "3f9a1c40-1111-4a00-9000-000000000006";
const paymentId = "3f9a1c40-1111-4a00-9000-000000000007";

const tx = {
  payment: { findFirst: vi.fn(), update: vi.fn() },
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    consumer_id: consumerId,
    distributor_id: distributorId,
    zone_id: zoneId,
    driver_id: driverId,
    status: OrderStatus.OUT_FOR_DELIVERY,
    delivery_date: new Date("2026-06-01T00:00:00.000Z"),
    delivery_window: DeliveryWindow.MORNING,
    collected_empty_qty: 0,
    returned_empty_qty: null,
    empty_not_collected_reason: null,
    items: [],
    ...overrides,
  } as any;
}

function cashPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: paymentId,
    order_id: orderId,
    status: PaymentStatus.CREATED,
    amount_cents: 3600,
    payment_method: "cash",
    ...overrides,
  } as any;
}

function auditCallFor(eventType: string) {
  return mocks.auditRepository.emit.mock.calls.find(([payload]) => payload.eventType === eventType);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: any) => callback(tx));
  tx.payment.findFirst.mockResolvedValue(null);
  mocks.orderRepository.updateStatus.mockImplementation(async (_id, status, extra) => ({
    ...order(),
    status,
    ...(extra ?? {}),
  }));
  mocks.resolveOrderInventoryLines.mockResolvedValue([]);
  mocks.inventoryAuditLines.mockReturnValue([]);
  mocks.notificationService.send.mockResolvedValue({ sent: 0, failed: 0 });
  mocks.subscriptionSettlementService.settleDelivered.mockResolvedValue(undefined);
});

describe("deliverOrderService.deliverOrder", () => {
  it("leva OUT_FOR_DELIVERY para DELIVERED e grava delivered_at", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    const result = await deliverOrderService.deliverOrder(orderId, driverId);

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.DELIVERED,
      expect.objectContaining({ delivered_at: expect.any(Date) }),
      tx
    );
  });

  it("rejeita transição a partir de um status que não permite entrega", async () => {
    mocks.orderRepository.findById.mockResolvedValue(
      order({ status: OrderStatus.READY_FOR_DISPATCH })
    );

    await expect(deliverOrderService.deliverOrder(orderId, driverId)).rejects.toThrow(
      OrderServiceError
    );
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejeita pedido inexistente", async () => {
    mocks.orderRepository.findById.mockResolvedValue(null);

    await expect(deliverOrderService.deliverOrder(orderId, driverId)).rejects.toThrow(
      OrderServiceError
    );
  });

  it("emite ORDER_DELIVERED dentro da transação", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await deliverOrderService.deliverOrder(orderId, driverId);

    const call = auditCallFor(AuditEventType.ORDER_DELIVERED);
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({
      eventType: AuditEventType.ORDER_DELIVERED,
      actor: { type: ActorType.DRIVER, id: driverId },
      orderId,
      sourceApp: SourceApp.DRIVER_WEB,
    });
    expect(call![1]).toBe(tx);
  });

  it("captura pagamento em dinheiro pendente e audita PAYMENT_CAPTURED", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());
    tx.payment.findFirst.mockResolvedValue(cashPayment());

    await deliverOrderService.deliverOrder(orderId, driverId);

    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: PaymentStatus.CAPTURED, paid_at: expect.any(Date) },
    });
    expect(auditCallFor(AuditEventType.PAYMENT_CAPTURED)).toBeDefined();
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.DELIVERED,
      expect.objectContaining({ payment_status: "paid" }),
      tx
    );
  });

  it("recusa entrega quando o pagamento em dinheiro está em status inválido", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());
    tx.payment.findFirst.mockResolvedValue(cashPayment({ status: PaymentStatus.REFUNDED }));

    await expect(deliverOrderService.deliverOrder(orderId, driverId)).rejects.toThrow(
      OrderServiceError
    );
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("compensa a assinatura dentro da mesma transação", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await deliverOrderService.deliverOrder(orderId, driverId);

    expect(mocks.subscriptionSettlementService.settleDelivered).toHaveBeenCalledWith(tx, orderId);
  });

  it("notifica o consumidor apenas depois do commit", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await deliverOrderService.deliverOrder(orderId, driverId);

    expect(mocks.orderEventsPublisher.notifyConsumer).toHaveBeenCalledWith(
      consumerId,
      "order_status_changed",
      { orderId, status: OrderStatus.DELIVERED }
    );
  });

  // COMPORTAMENTO A CORRIGIR (Fase 4 do plano): distribuidor e ops não recebem
  // nenhum sinal quando o motorista conclui a entrega.
  it("hoje NÃO notifica a distribuidora quando a entrega conclui", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await deliverOrderService.deliverOrder(orderId, driverId);

    expect(mocks.orderEventsPublisher.distributorOrderStatusChanged).not.toHaveBeenCalled();
    expect(mocks.orderEventsPublisher.notifyDistributor).not.toHaveBeenCalled();
  });

  // COMPORTAMENTO A CORRIGIR (Fase 2 do plano): a entrega fecha sem nenhum
  // registro de vasilhame (nem troca, nem motivo de não-coleta).
  it("hoje conclui a entrega mesmo sem registro de vasilhame", async () => {
    mocks.orderRepository.findById.mockResolvedValue(
      order({ collected_empty_qty: 0, returned_empty_qty: null, empty_not_collected_reason: null })
    );

    const result = await deliverOrderService.deliverOrder(orderId, driverId);

    expect(result.status).toBe(OrderStatus.DELIVERED);
  });

  // COMPORTAMENTO A CORRIGIR (Fase 2 do plano): leitura sem lock, assimétrica
  // com markDeliveryFailed, que usa findByIdWithItemsForUpdate.
  it("hoje lê o pedido sem lock", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await deliverOrderService.deliverOrder(orderId, driverId);

    expect(mocks.orderRepository.findById).toHaveBeenCalledWith(orderId, tx);
    expect(mocks.orderRepository.findByIdWithItemsForUpdate).not.toHaveBeenCalled();
  });

  // COMPORTAMENTO A CORRIGIR (Fase 3 do plano): o ator é sempre DRIVER/DRIVER_WEB,
  // mesmo quando quem conclui é ops via otp-override — auditoria falsificada.
  it("hoje audita como DRIVER mesmo quando o id recebido é de um usuário de ops", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order());

    await deliverOrderService.deliverOrder(orderId, opsUserId);

    expect(auditCallFor(AuditEventType.ORDER_DELIVERED)![0]).toMatchObject({
      actor: { type: ActorType.DRIVER, id: opsUserId },
      sourceApp: SourceApp.DRIVER_WEB,
    });
  });
});

describe("deliverOrderService.markDeliveryFailed", () => {
  it("leva OUT_FOR_DELIVERY para DELIVERY_FAILED gravando o motivo", async () => {
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(order());

    const result = await deliverOrderService.markDeliveryFailed(
      orderId,
      driverId,
      "Cliente ausente"
    );

    expect(result.status).toBe(OrderStatus.DELIVERY_FAILED);
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.DELIVERY_FAILED,
      { cancellation_reason: "Cliente ausente" },
      tx
    );
  });

  it("rejeita transição a partir de status inválido", async () => {
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(
      order({ status: OrderStatus.DELIVERED })
    );

    await expect(
      deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente")
    ).rejects.toThrow(OrderServiceError);
  });

  it("lê o pedido com lock", async () => {
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(order());

    await deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente");

    expect(mocks.orderRepository.findByIdWithItemsForUpdate).toHaveBeenCalledWith(orderId, tx);
  });

  // Emite REDELIVERY_REQUIRED — o evento que alimenta a taxa de reentrega dos
  // painéis. Falha de entrega não é cancelamento: emitir ORDER_CANCELLED aqui
  // mantinha o KPI zerado e fazia a timeline do cliente dizer "Pedido
  // cancelado". Corrigido em ago/2026.
  it("emite REDELIVERY_REQUIRED com o motivo, e não ORDER_CANCELLED", async () => {
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(order());

    await deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente");

    expect(auditCallFor(AuditEventType.REDELIVERY_REQUIRED)![0]).toMatchObject({
      eventType: AuditEventType.REDELIVERY_REQUIRED,
      actor: { type: ActorType.DRIVER, id: driverId },
      orderId,
      sourceApp: SourceApp.DRIVER_WEB,
      payload: expect.objectContaining({ reason: "Cliente ausente", type: "DELIVERY_FAILED" }),
    });
    expect(auditCallFor(AuditEventType.ORDER_CANCELLED)).toBeUndefined();
  });

  it("notifica o consumidor após o commit", async () => {
    mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(order());

    await deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente");

    expect(mocks.orderEventsPublisher.notifyConsumer).toHaveBeenCalledWith(
      consumerId,
      "order_status_changed",
      { orderId, status: OrderStatus.DELIVERY_FAILED }
    );
  });
});

describe("deliverOrderService.scheduleRedelivery", () => {
  const newDate = new Date("2026-06-05T00:00:00.000Z");

  it("leva DELIVERY_FAILED para REDELIVERY_SCHEDULED com a nova data", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ status: OrderStatus.DELIVERY_FAILED }));

    const result = await deliverOrderService.scheduleRedelivery(orderId, opsUserId, newDate);

    expect(result.status).toBe(OrderStatus.REDELIVERY_SCHEDULED);
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.REDELIVERY_SCHEDULED,
      { delivery_date: newDate },
      tx
    );
  });

  it("rejeita reagendamento de pedido que não falhou", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ status: OrderStatus.OUT_FOR_DELIVERY }));

    await expect(
      deliverOrderService.scheduleRedelivery(orderId, opsUserId, newDate)
    ).rejects.toThrow(OrderServiceError);
  });

  // Emite REDELIVERY_SCHEDULED. Antes emitia ORDER_CONFIRMED, que a timeline
  // do consumidor renderiza como "Pagamento confirmado" — logo após uma falha
  // de entrega, o cliente entendia que tinha sido cobrado de novo.
  it("emite REDELIVERY_SCHEDULED, e não ORDER_CONFIRMED", async () => {
    mocks.orderRepository.findById.mockResolvedValue(order({ status: OrderStatus.DELIVERY_FAILED }));

    await deliverOrderService.scheduleRedelivery(orderId, opsUserId, newDate);

    expect(auditCallFor(AuditEventType.REDELIVERY_SCHEDULED)![0]).toMatchObject({
      eventType: AuditEventType.REDELIVERY_SCHEDULED,
      actor: { type: ActorType.OPS, id: opsUserId },
      sourceApp: SourceApp.OPS_CONSOLE,
      payload: { newDate: newDate.toISOString(), type: "REDELIVERY_SCHEDULED" },
    });
    expect(auditCallFor(AuditEventType.ORDER_CONFIRMED)).toBeUndefined();
  });
});
