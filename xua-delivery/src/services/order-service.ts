import db from "@/src/lib/db";
import { getIO } from "@/src/lib/socket";
import { orderRepository } from "@/src/repositories/order-repository";
import { auditRepository } from "@/src/repositories/audit-repository";
import { capacityService } from "@/src/services/capacity-service";
import { OrderStatus, AuditEventType, ActorType, SourceApp } from "@/src/types/enums";
import type { Order } from "@/src/types";

// ARCH-03: Máquina de estados — transições válidas
const VALID_TRANSITIONS: Record<string, string[]> = {
  [OrderStatus.CREATED]: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.REJECTED_BY_DISTRIBUTOR, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.CANCELLED],
  [OrderStatus.REJECTED_BY_DISTRIBUTOR]: [],
  [OrderStatus.READY_FOR_DISPATCH]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.DELIVERY_FAILED]: [OrderStatus.REDELIVERY_SCHEDULED, OrderStatus.CANCELLED],
  [OrderStatus.REDELIVERY_SCHEDULED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
};

function assertTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`INVALID_TRANSITION: ${currentStatus} → ${newStatus}`);
  }
}

/**
 * OrderService — TODA lógica de negócio do pedido.
 * Padrão: transação Knex → mutação + audit atômico → Socket.io pós-commit (seção 3.3).
 */
export const orderService = {
  async createOrder(data: {
    consumerId: string;
    addressId: string;
    distributorId: string;
    zoneId: string;
    deliveryDate: string;
    deliveryWindow: "morning" | "afternoon";
    items: Array<{
      product_id: string;
      product_name: string;
      unit_price_cents: number;
      quantity: number;
    }>;
  }): Promise<Order> {
    const subtotalCents = data.items.reduce(
      (acc, i) => acc + i.unit_price_cents * i.quantity,
      0
    );
    const deliveryFeeCents = 500; // R$ 5,00 padrão
    const totalCents = subtotalCents + deliveryFeeCents;

    const order = await db.transaction(async (trx) => {
      // ARCH-04: Reserva capacidade dentro da mesma transação
      await capacityService.reserve(
        data.zoneId,
        data.deliveryDate,
        data.deliveryWindow,
        trx
      );

      const created = await orderRepository.create(
        {
          consumer_id: data.consumerId,
          address_id: data.addressId,
          distributor_id: data.distributorId,
          zone_id: data.zoneId,
          status: OrderStatus.CREATED,
          delivery_date: data.deliveryDate,
          delivery_window: data.deliveryWindow,
          subtotal_cents: subtotalCents,
          delivery_fee_cents: deliveryFeeCents,
          deposit_cents: 0,
          total_cents: totalCents,
          rating: null,
          rating_comment: null,
          collected_empty_qty: 0,
          cancellation_reason: null,
          accepted_at: null,
          dispatched_at: null,
          delivered_at: null,
        },
        trx
      );

      // Insere items do pedido
      await trx("10_trn_order_items").insert(
        data.items.map((item) => ({
          order_id: created.id,
          product_id: item.product_id,
          product_name: item.product_name,
          unit_price_cents: item.unit_price_cents,
          quantity: item.quantity,
          subtotal_cents: item.unit_price_cents * item.quantity,
        }))
      );

      // Evento de auditoria na mesma transação
      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CREATED,
          actor: { type: ActorType.CONSUMER, id: data.consumerId },
          orderId: created.id,
          sourceApp: SourceApp.CONSUMER_WEB,
        },
        trx
      );

      return created;
    });

    return order;
  },

  async acceptOrder(orderId: string, distributorUserId: string): Promise<Order> {
    const order = await db.transaction(async (trx) => {
      const current = await orderRepository.findById(orderId, trx);
      if (!current) throw new Error("ORDER_NOT_FOUND");
      assertTransition(current.status, OrderStatus.ACCEPTED_BY_DISTRIBUTOR);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
        { accepted_at: new Date() },
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        trx
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

  async rejectOrder(
    orderId: string,
    distributorUserId: string,
    reason: string,
    details?: string
  ): Promise<Order> {
    const order = await db.transaction(async (trx) => {
      const current = await orderRepository.findById(orderId, trx);
      if (!current) throw new Error("ORDER_NOT_FOUND");
      assertTransition(current.status, OrderStatus.REJECTED_BY_DISTRIBUTOR);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.REJECTED_BY_DISTRIBUTOR,
        { cancellation_reason: reason },
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: { reason, details },
        },
        trx
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

  async completeChecklist(orderId: string, distributorUserId: string): Promise<Order> {
    const order = await db.transaction(async (trx) => {
      const current = await orderRepository.findById(orderId, trx);
      if (!current) throw new Error("ORDER_NOT_FOUND");
      assertTransition(current.status, OrderStatus.READY_FOR_DISPATCH);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.READY_FOR_DISPATCH,
        undefined,
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.DISPATCH_CHECKLIST_COMPLETED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        trx
      );

      return updated;
    });

    return order;
  },

  async dispatch(orderId: string, distributorUserId: string): Promise<Order> {
    const order = await db.transaction(async (trx) => {
      const current = await orderRepository.findById(orderId, trx);
      if (!current) throw new Error("ORDER_NOT_FOUND");
      assertTransition(current.status, OrderStatus.OUT_FOR_DELIVERY);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.OUT_FOR_DELIVERY,
        { dispatched_at: new Date() },
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DISPATCHED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        trx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

    return order;
  },

  async deliverOrder(orderId: string, driverId: string): Promise<Order> {
    const order = await db.transaction(async (trx) => {
      const current = await orderRepository.findById(orderId, trx);
      if (!current) throw new Error("ORDER_NOT_FOUND");
      assertTransition(current.status, OrderStatus.DELIVERED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.DELIVERED,
        { delivered_at: new Date() },
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: ActorType.DRIVER, id: driverId },
          orderId,
          sourceApp: SourceApp.DRIVER_WEB,
        },
        trx
      );

      return updated;
    });

    const io = getIO();
    io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERED,
    });

    return order;
  },

  async cancelOrder(
    orderId: string,
    actorId: string,
    actorType: "consumer" | "ops",
    reason: string
  ): Promise<Order> {
    const actor = actorType === "consumer" ? ActorType.CONSUMER : ActorType.OPS;
    const sourceApp =
      actorType === "consumer" ? SourceApp.CONSUMER_WEB : SourceApp.OPS_CONSOLE;

    const order = await db.transaction(async (trx) => {
      const current = await orderRepository.findById(orderId, trx);
      if (!current) throw new Error("ORDER_NOT_FOUND");
      assertTransition(current.status, OrderStatus.CANCELLED);

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.CANCELLED,
        { cancellation_reason: reason },
        trx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CANCELLED,
          actor: { type: actor, id: actorId },
          orderId,
          sourceApp,
          payload: { reason },
        },
        trx
      );

      return updated;
    });

    return order;
  },
};
