import { OrderStatus, AuditEventType, ActorType, SourceApp, DeliveryWindow, Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { getIO } from "../../../infra/socket/gateway.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { capacityService } from "../../distributor/services/capacity.service.js";
import { depositService } from "../../consumers/services/deposit.service.js";
import { notificationService } from "../../notifications/services/notification.service.js";
import { logger } from "../../../infra/logger/index.js";

type TxClient = Prisma.TransactionClient;

// ARCH-03: Máquina de estados — transições válidas (com estados intermediários)
const VALID_TRANSITIONS: Record<string, string[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SENT_TO_DISTRIBUTOR, OrderStatus.CANCELLED],
  [OrderStatus.SENT_TO_DISTRIBUTOR]: [
    OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    OrderStatus.REJECTED_BY_DISTRIBUTOR,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.CANCELLED],
  [OrderStatus.REJECTED_BY_DISTRIBUTOR]: [],
  [OrderStatus.READY_FOR_DISPATCH]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERY_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.DELIVERY_FAILED]: [OrderStatus.REDELIVERY_SCHEDULED, OrderStatus.CANCELLED],
  [OrderStatus.REDELIVERY_SCHEDULED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
};

function assertTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new OrderServiceError(
      "INVALID_TRANSITION",
      `Transição inválida: ${currentStatus} → ${newStatus}`
    );
  }
}

export class OrderServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OrderServiceError";
  }
}

/**
 * OrderService — TODA lógica de negócio do pedido.
 * Padrão: transação Prisma → mutação + audit atômico → Socket.io pós-commit (seção 3.3).
 */
export const orderService = {
  async createOrder(data: {
    consumerId: string;
    addressId: string;
    distributorId: string;
    zoneId: string;
    deliveryDate: string;
    deliveryWindow: DeliveryWindow;
    items: Array<{
      product_id: string;
      product_name: string;
      unit_price_cents: number;
      quantity: number;
    }>;
  }): Promise<Order> {
    const prisma = getPrisma();
    const subtotalCents = data.items.reduce(
      (acc, i) => acc + i.unit_price_cents * i.quantity,
      0
    );
    const deliveryFeeCents = 500; // R$ 5,00 padrão

    const order = await prisma.$transaction(async (tx: TxClient) => {
      const previousOrdersCount = await tx.order.count({
        where: {
          consumer_id: data.consumerId,
          status: { not: OrderStatus.CANCELLED },
        },
      });
      const isFirstPurchase = previousOrdersCount === 0;
      const depositAmountCents = isFirstPurchase
        ? depositService.getDepositAmountCents()
        : 0;
      const totalCents = subtotalCents + deliveryFeeCents + depositAmountCents;

      // ARCH-04: Reserva capacidade dentro da mesma transação
      await capacityService.reserve(
        data.zoneId,
        data.deliveryDate,
        data.deliveryWindow,
        tx
      );

      const created = await orderRepository.create(
        {
          consumer_id: data.consumerId,
          address_id: data.addressId,
          distributor_id: data.distributorId,
          zone_id: data.zoneId,
          status: OrderStatus.CREATED,
          delivery_date: new Date(data.deliveryDate),
          delivery_window: data.deliveryWindow,
          subtotal_cents: subtotalCents,
          delivery_fee_cents: deliveryFeeCents,
          deposit_cents: depositAmountCents,
          total_cents: totalCents,
          rating: null,
          rating_comment: null,
          nps_score: null,
          nps_comment: null,
          collected_empty_qty: 0,
          returned_empty_qty: null,
          bottle_condition: null,
          empty_not_collected_reason: null,
          empty_not_collected_notes: null,
          payment_status: null,
          cancellation_reason: null,
          accepted_at: null,
          dispatched_at: null,
          delivered_at: null,
          driver_id: null,
          deposit_amount_cents: depositAmountCents,
          qty_20l_sent: null,
          qty_20l_returned: null,
        },
        tx
      );

      // Insere items do pedido
      await tx.orderItem.createMany({
        data: data.items.map((item) => ({
          order_id: created.id,
          product_id: item.product_id,
          product_name: item.product_name,
          unit_price_cents: item.unit_price_cents,
          quantity: item.quantity,
          subtotal_cents: item.unit_price_cents * item.quantity,
        })),
      });

      // Evento de auditoria na mesma transação
      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CREATED,
          actor: { type: ActorType.CONSUMER, id: data.consumerId },
          orderId: created.id,
          sourceApp: SourceApp.CONSUMER_WEB,
        },
        tx
      );

      if (isFirstPurchase) {
        await depositService.holdDeposit(
          data.consumerId,
          created.id,
          depositAmountCents,
          tx,
          { isFirstPurchase: true }
        );
      }

      return created;
    });

    logger.info({ orderId: order.id }, "Order created");
    return order;
  },

  /**
   * Submete pedido para pagamento: CREATED → PAYMENT_PENDING
   */
  async submitForPayment(orderId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.PAYMENT_PENDING);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.PAYMENT_PENDING,
        undefined,
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Confirma pedido após pagamento: PAYMENT_PENDING → CONFIRMED
   */
  async confirmOrder(orderId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.CONFIRMED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.CONFIRMED,
        undefined,
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CONFIRMED,
          actor: { type: ActorType.SYSTEM, id: "payment-gateway" },
          orderId,
          sourceApp: SourceApp.BACKEND,
        },
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Envia pedido ao distribuidor: CONFIRMED → SENT_TO_DISTRIBUTOR
   */
  async sendToDistributor(orderId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.SENT_TO_DISTRIBUTOR);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.SENT_TO_DISTRIBUTOR,
        undefined,
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
          actor: { type: ActorType.SYSTEM, id: "system" },
          orderId,
          sourceApp: SourceApp.BACKEND,
        },
        tx
      );

      return updated;
    });

    // Socket.io pós-commit: notifica distribuidor
    const io = getIO();
    io.to(`distributor_admin:${order.distributor_id}`).emit("new_order", {
      orderId,
      status: OrderStatus.SENT_TO_DISTRIBUTOR,
    });

    return order;
  },

  /**
   * Distribuidor aceita pedido: SENT_TO_DISTRIBUTOR → ACCEPTED_BY_DISTRIBUTOR
   */
  async acceptOrder(orderId: string, distributorUserId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.ACCEPTED_BY_DISTRIBUTOR);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
        { accepted_at: new Date() },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        tx
      );

      return updated;
    });

    // Socket.io SOMENTE após commit (seção 3.3)
    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    });

    return order;
  },

  /**
   * Distribuidor rejeita pedido: SENT_TO_DISTRIBUTOR → REJECTED_BY_DISTRIBUTOR
   */
  async rejectOrder(
    orderId: string,
    distributorUserId: string,
    reason: string,
    details?: string
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.REJECTED_BY_DISTRIBUTOR);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.REJECTED_BY_DISTRIBUTOR,
        { cancellation_reason: reason },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: { reason, details },
        },
        tx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.REJECTED_BY_DISTRIBUTOR,
    });

    return order;
  },

  /**
   * Completa checklist de despacho: ACCEPTED_BY_DISTRIBUTOR → READY_FOR_DISPATCH
   */
  async completeChecklist(orderId: string, distributorUserId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.READY_FOR_DISPATCH);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.READY_FOR_DISPATCH,
        undefined,
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.DISPATCH_CHECKLIST_COMPLETED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Despacha pedido: READY_FOR_DISPATCH → OUT_FOR_DELIVERY
   * Também gera OTP para confirmação de entrega.
   */
  async dispatch(orderId: string, distributorUserId: string, driverId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.OUT_FOR_DELIVERY);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.OUT_FOR_DELIVERY,
        { dispatched_at: new Date(), driver_id: driverId },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DISPATCHED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: { driverId },
        },
        tx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

    // Notifica driver
    io.to(`driver:${driverId}`).emit("new_delivery", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

    // Push notification - OTP será gerado e enviado pelo controller após esta chamada
    notificationService
      .send(order.consumer_id, "Pedido saiu para entrega!", "Acompanhe seu pedido em tempo real.")
      .catch(() => {});

    return order;
  },

  /**
   * Entrega pedido: OUT_FOR_DELIVERY → DELIVERED
   */
  async deliverOrder(orderId: string, driverId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.DELIVERED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.DELIVERED,
        { delivered_at: new Date() },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
        },
        tx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERED,
    });

    // Push notification
    notificationService
      .send(order.consumer_id, "Pedido entregue!", "Seu pedido foi entregue com sucesso.")
      .catch(() => {});

    return order;
  },

  /**
   * Registra falha na entrega: OUT_FOR_DELIVERY → DELIVERY_FAILED
   */
  async markDeliveryFailed(orderId: string, driverId: string, reason: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.DELIVERY_FAILED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.DELIVERY_FAILED,
        { cancellation_reason: reason },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CANCELLED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: { reason, type: "DELIVERY_FAILED" },
        },
        tx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERY_FAILED,
    });

    return order;
  },

  /**
   * Agenda reentrega: DELIVERY_FAILED → REDELIVERY_SCHEDULED
   */
  async scheduleRedelivery(orderId: string, opsUserId: string, newDate: Date): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.REDELIVERY_SCHEDULED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.REDELIVERY_SCHEDULED,
        { delivery_date: newDate },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CONFIRMED,
          actor: { type: ActorType.OPS, id: opsUserId },
          orderId,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { newDate: newDate.toISOString(), type: "REDELIVERY_SCHEDULED" },
        },
        tx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.REDELIVERY_SCHEDULED,
    });

    return order;
  },

  /**
   * Cancela pedido
   */
  async cancelOrder(
    orderId: string,
    actorId: string,
    actorType: "consumer" | "ops" | "distributor",
    reason: string
  ): Promise<Order> {
    const actorMap: Record<string, ActorType> = {
      consumer: ActorType.CONSUMER,
      ops: ActorType.OPS,
      distributor: ActorType.DISTRIBUTOR_USER,
    };
    const sourceAppMap: Record<string, SourceApp> = {
      consumer: SourceApp.CONSUMER_WEB,
      ops: SourceApp.OPS_CONSOLE,
      distributor: SourceApp.DISTRIBUTOR_WEB,
    };
    const actor = actorMap[actorType];
    const sourceApp = sourceAppMap[actorType];

    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.CANCELLED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.CANCELLED,
        { cancellation_reason: reason },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CANCELLED,
          actor: { type: actor, id: actorId },
          orderId,
          sourceApp,
          payload: { reason },
        },
        tx
      );

      // Libera capacidade se estava reservada
      await capacityService.release(
        current.zone_id,
        current.delivery_date.toISOString().split("T")[0],
        current.delivery_window,
        tx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.CANCELLED,
    });

    return order;
  },

  /**
   * Registra avaliação NPS
   */
  async submitRating(
    orderId: string,
    consumerId: string,
    rating: number,
    comment?: string
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.consumer_id !== consumerId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      if (current.status !== OrderStatus.DELIVERED) {
        throw new OrderServiceError("INVALID_STATUS", "Pedido precisa estar entregue para avaliar");
      }

      const updated = await orderRepository.update(
        orderId,
        {
          nps_score: rating,
          nps_comment: comment ?? null,
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: ActorType.CONSUMER, id: consumerId },
          orderId,
          sourceApp: SourceApp.CONSUMER_WEB,
          payload: { rating, comment, action: "nps_submitted" },
        },
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Registra troca de vasilhame
   */
  async recordBottleExchange(
    orderId: string,
    driverId: string,
    data: { collectedQty: number; returnedQty: number; condition?: string }
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.driver_id !== driverId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }

      const updated = await orderRepository.update(
        orderId,
        {
          collected_empty_qty: data.collectedQty,
          returned_empty_qty: data.returnedQty,
          bottle_condition: data.condition ?? null,
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.BOTTLE_EXCHANGE_RECORDED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: data,
        },
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Registra vasilhame não coletado
   */
  async recordEmptyNotCollected(
    orderId: string,
    driverId: string,
    data: { reason: string; notes?: string }
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.driver_id !== driverId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }

      const updated = await orderRepository.update(
        orderId,
        {
          empty_not_collected_reason: data.reason,
          empty_not_collected_notes: data.notes ?? null,
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.EMPTY_NOT_COLLECTED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
          payload: data,
        },
        tx
      );

      return updated;
    });

    return order;
  },

  /**
   * Busca pedido por ID com timeline de eventos
   */
  async findByIdWithTimeline(orderId: string): Promise<{
    order: Order;
    timeline: Array<{
      id: string;
      event_type: string;
      occurred_at: Date;
      actor_type: string;
      payload: object;
    }>;
  } | null> {
    const order = await orderRepository.findByIdWithItems(orderId);
    if (!order) return null;

    const events = await auditRepository.findByOrder(orderId);

    return {
      order,
      timeline: events.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        occurred_at: e.occurred_at,
        actor_type: e.actor_type,
        payload: e.payload as object,
      })),
    };
  },
};
