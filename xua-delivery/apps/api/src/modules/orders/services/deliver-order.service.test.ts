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
    notifyOps: vi.fn(),
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

const driverActor = {
  type: ActorType.DRIVER,
  id: driverId,
  sourceApp: SourceApp.DRIVER_WEB,
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

/**
 * Prepara a leitura do pedido nos dois caminhos (com e sem lock).
 *
 * Fixar só um deles esconde erro: quando deliverOrder passou a ler com lock,
 * os testes que mockavam apenas findById continuaram "verdes" porque o serviço
 * recebia null e lançava ORDER_NOT_FOUND — passando pelo motivo errado.
 */
function givenOrder(current: ReturnType<typeof order> | null) {
  mocks.orderRepository.findById.mockResolvedValue(current);
  mocks.orderRepository.findByIdWithItemsForUpdate.mockResolvedValue(current);
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
    givenOrder(order());

    const result = await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(mocks.orderRepository.updateStatus).toHaveBeenCalledWith(
      orderId,
      OrderStatus.DELIVERED,
      expect.objectContaining({ delivered_at: expect.any(Date) }),
      tx
    );
  });

  it("rejeita transição a partir de um status que não permite entrega", async () => {
    givenOrder(
      order({ status: OrderStatus.READY_FOR_DISPATCH })
    );

    await expect(deliverOrderService.deliverOrder(orderId, driverActor)).rejects.toThrow(
      OrderServiceError
    );
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("rejeita pedido inexistente", async () => {
    givenOrder(null);

    await expect(deliverOrderService.deliverOrder(orderId, driverActor)).rejects.toThrow(
      OrderServiceError
    );
  });

  it("emite ORDER_DELIVERED dentro da transação", async () => {
    givenOrder(order());

    await deliverOrderService.deliverOrder(orderId, driverActor);

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
    givenOrder(order());
    tx.payment.findFirst.mockResolvedValue(cashPayment());

    await deliverOrderService.deliverOrder(orderId, driverActor);

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
    givenOrder(order());
    tx.payment.findFirst.mockResolvedValue(cashPayment({ status: PaymentStatus.REFUNDED }));

    await expect(deliverOrderService.deliverOrder(orderId, driverActor)).rejects.toThrow(
      OrderServiceError
    );
    expect(mocks.orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("compensa a assinatura dentro da mesma transação", async () => {
    givenOrder(order());

    await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(mocks.subscriptionSettlementService.settleDelivered).toHaveBeenCalledWith(tx, orderId);
  });

  it("notifica o consumidor apenas depois do commit", async () => {
    givenOrder(order());

    await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(mocks.orderEventsPublisher.notifyConsumer).toHaveBeenCalledWith(
      consumerId,
      "order_status_changed",
      { orderId, status: OrderStatus.DELIVERED }
    );
  });

  // A distribuidora acompanha a fila em tempo real desde o aceite e o despacho,
  // mas parava de receber sinal no desfecho: a entrega só aparecia no painel
  // depois de um refresh manual.
  it("notifica a distribuidora quando a entrega conclui", async () => {
    givenOrder(order());

    await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(mocks.orderEventsPublisher.distributorOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: orderId }),
      OrderStatus.DELIVERED
    );
  });

  // MODO TOLERANTE (Estágio 2A). Ainda concluímos a entrega sem o registro de
  // vasilhame, de propósito: apps antigos em cache no celular confirmam o
  // código antes de abrir a tela de vasilhame, e rejeitar agora travaria
  // entregas em campo durante o deploy. Quando o Estágio 2C ligar o guard
  // estrito, este teste deve falhar e virar uma asserção de rejeição.
  it("ainda conclui a entrega sem registro de vasilhame, mas marca na auditoria", async () => {
    givenOrder(order({ bottle_step_recorded_at: null }));

    const result = await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(auditCallFor(AuditEventType.ORDER_DELIVERED)![0]).toMatchObject({
      payload: { bottle_step_recorded: false, bottle_step_recorded_at: null },
    });
  });

  it("registra na auditoria quando o passo de vasilhame foi cumprido", async () => {
    const recordedAt = new Date("2026-06-01T10:30:00.000Z");
    givenOrder(order({ bottle_step_recorded_at: recordedAt }));

    await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(auditCallFor(AuditEventType.ORDER_DELIVERED)![0]).toMatchObject({
      payload: {
        bottle_step_recorded: true,
        bottle_step_recorded_at: recordedAt.toISOString(),
      },
    });
  });

  // Lê com lock, simétrico com markDeliveryFailed. Sem isso, duas confirmações
  // concorrentes liam o mesmo estado e ambas seguiam adiante.
  it("lê o pedido com lock", async () => {
    givenOrder(order());

    await deliverOrderService.deliverOrder(orderId, driverActor);

    expect(mocks.orderRepository.findByIdWithItemsForUpdate).toHaveBeenCalledWith(orderId, tx);
  });

  // O ator vem de quem chamou, não é mais fixo em DRIVER/DRIVER_WEB. Antes, um
  // override de ops era gravado como se o motorista tivesse validado o código,
  // com o id do usuário de ops no campo do motorista.
  it("audita com o ator real quando quem conclui é ops via override", async () => {
    givenOrder(order());

    await deliverOrderService.deliverOrder(orderId, {
      type: ActorType.OPS,
      id: opsUserId,
      sourceApp: SourceApp.OPS_CONSOLE,
    });

    expect(auditCallFor(AuditEventType.ORDER_DELIVERED)![0]).toMatchObject({
      actor: { type: ActorType.OPS, id: opsUserId },
      sourceApp: SourceApp.OPS_CONSOLE,
    });
  });

  it("propaga o ator real também para a captura do pagamento em dinheiro", async () => {
    givenOrder(order());
    tx.payment.findFirst.mockResolvedValue(cashPayment());

    await deliverOrderService.deliverOrder(orderId, {
      type: ActorType.SUPPORT,
      id: opsUserId,
      sourceApp: SourceApp.OPS_CONSOLE,
    });

    expect(auditCallFor(AuditEventType.PAYMENT_CAPTURED)![0]).toMatchObject({
      actor: { type: ActorType.SUPPORT, id: opsUserId },
      sourceApp: SourceApp.OPS_CONSOLE,
    });
  });
});

describe("deliverOrderService.markDeliveryFailed", () => {
  it("leva OUT_FOR_DELIVERY para DELIVERY_FAILED gravando o motivo", async () => {
    givenOrder(order());

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
    givenOrder(
      order({ status: OrderStatus.DELIVERED })
    );

    await expect(
      deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente")
    ).rejects.toThrow(OrderServiceError);
  });

  it("lê o pedido com lock", async () => {
    givenOrder(order());

    await deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente");

    expect(mocks.orderRepository.findByIdWithItemsForUpdate).toHaveBeenCalledWith(orderId, tx);
  });

  // Emite REDELIVERY_REQUIRED — o evento que alimenta a taxa de reentrega dos
  // painéis. Falha de entrega não é cancelamento: emitir ORDER_CANCELLED aqui
  // mantinha o KPI zerado e fazia a timeline do cliente dizer "Pedido
  // cancelado". Corrigido em ago/2026.
  it("emite REDELIVERY_REQUIRED com o motivo, e não ORDER_CANCELLED", async () => {
    givenOrder(order());

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
    givenOrder(order());

    await deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente");

    expect(mocks.orderEventsPublisher.notifyConsumer).toHaveBeenCalledWith(
      consumerId,
      "order_status_changed",
      { orderId, status: OrderStatus.DELIVERY_FAILED }
    );
  });

  // Falha de entrega é o evento que mais exige reação: a distribuidora
  // reprograma a rota e ops decide a reentrega. Nenhum dos dois recebia sinal.
  it("notifica distribuidora e ops na falha de entrega", async () => {
    givenOrder(order());

    await deliverOrderService.markDeliveryFailed(orderId, driverId, "Cliente ausente");

    expect(mocks.orderEventsPublisher.distributorOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: orderId }),
      OrderStatus.DELIVERY_FAILED,
      { reason: "Cliente ausente" }
    );
    expect(mocks.orderEventsPublisher.notifyOps).toHaveBeenCalledWith(
      "order_status_changed",
      expect.objectContaining({
        orderId,
        status: OrderStatus.DELIVERY_FAILED,
        reason: "Cliente ausente",
      })
    );
  });
});

describe("deliverOrderService.scheduleRedelivery", () => {
  const newDate = new Date("2026-06-05T00:00:00.000Z");

  it("leva DELIVERY_FAILED para REDELIVERY_SCHEDULED com a nova data", async () => {
    givenOrder(order({ status: OrderStatus.DELIVERY_FAILED }));

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
    givenOrder(order({ status: OrderStatus.OUT_FOR_DELIVERY }));

    await expect(
      deliverOrderService.scheduleRedelivery(orderId, opsUserId, newDate)
    ).rejects.toThrow(OrderServiceError);
  });

  // Emite REDELIVERY_SCHEDULED. Antes emitia ORDER_CONFIRMED, que a timeline
  // do consumidor renderiza como "Pagamento confirmado" — logo após uma falha
  // de entrega, o cliente entendia que tinha sido cobrado de novo.
  it("emite REDELIVERY_SCHEDULED, e não ORDER_CONFIRMED", async () => {
    givenOrder(order({ status: OrderStatus.DELIVERY_FAILED }));

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
