import { OrderStatus } from "@xua/shared/enums";
import {
  DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES,
  type DistributorQueueQueryInput,
  type DistributorQueueStageInput,
} from "@xua/shared/schemas/order";
import { getPrisma } from "../../../infra/prisma/client.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { orderRepository, type OrderForQueue } from "../repository/orders.repository.js";
import { OrderServiceError } from "../errors.js";
import { buildDistributorOrderOriginContext } from "./order-presentation.service.js";
import redis from "../../../infra/redis/client.js";

const DISTRIBUTOR_QUEUE_STAGE_STATUSES: Record<DistributorQueueStageInput, OrderStatus[]> = {
  all: [...DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES] as OrderStatus[],
  incoming: [OrderStatus.SENT_TO_DISTRIBUTOR],
  preparation: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH],
  route: [OrderStatus.OUT_FOR_DELIVERY],
};

function buildDistributorQueueSummary(statusCounts: Partial<Record<OrderStatus, number>>) {
  const incoming = statusCounts[OrderStatus.SENT_TO_DISTRIBUTOR] ?? 0;
  const preparation =
    (statusCounts[OrderStatus.ACCEPTED_BY_DISTRIBUTOR] ?? 0) +
    (statusCounts[OrderStatus.READY_FOR_DISPATCH] ?? 0);
  const route = statusCounts[OrderStatus.OUT_FOR_DELIVERY] ?? 0;

  return {
    active: incoming + preparation + route,
    incoming,
    preparation,
    route,
  };
}

function mapDistributorQueueOrder(o: OrderForQueue, driverNameById: Map<string, string>) {
  const subscriptionContext = buildDistributorOrderOriginContext(o);
  const totalItemsQty = o.items.reduce((sum, item) => sum + item.quantity, 0);
  const firstItem = o.items[0];
  const itemSummary = firstItem
    ? o.items.length > 1
      ? `${totalItemsQty} itens em ${o.items.length} produtos`
      : `${firstItem.quantity}x ${firstItem.product_name}`
    : "0 item(ns)";

  return {
    ...o,
    ...subscriptionContext,
    consumer_name: o.consumer.name,
    address_summary: `${o.address.street}, ${o.address.number}${o.address.neighborhood ? ` - ${o.address.neighborhood}` : ""}`,
    total_items_qty: totalItemsQty,
    item_summary: itemSummary,
    driver_name: o.driver_id ? (driverNameById.get(o.driver_id) ?? null) : null,
    sla_deadline: new Date(new Date(o.created_at).getTime() + 15 * 60 * 1000).toISOString(),
    consumer: undefined,
    address: undefined,
    items: undefined,
    subscription_delivery_date: undefined,
  };
}

/**
 * orderQueryService — listagens e detalhamento de pedidos (sem mutação de estado).
 */
export const orderQueryService = {
  async listDistributorQueue(userId: string, role: string, query: DistributorQueueQueryInput) {
    if (role !== "distributor_admin") {
      throw new OrderServiceError("FORBIDDEN", "Acesso negado");
    }

    const distributorId = await distributorRepository.resolveDistributorId(userId);
    if (!distributorId) {
      throw new OrderServiceError("FORBIDDEN", "Usuário não vinculado a nenhuma distribuidora");
    }

    const statuses = query.status
      ? [query.status as OrderStatus]
      : DISTRIBUTOR_QUEUE_STAGE_STATUSES[query.stage];
    const activeStatuses = [...DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES] as OrderStatus[];

    const { orders, total, statusCounts } = await orderRepository.findByDistributorPaged(distributorId, {
      statuses,
      summaryStatuses: activeStatuses,
      page: query.page,
      limit: query.limit,
      q: query.q,
      origin: query.origin,
      deliveryDate: query.deliveryDate,
      start: query.start,
      end: query.end,
      driverId: query.driverId,
      sort: query.sort,
    });

    const driverIds = Array.from(
      new Set(
        orders
          .map((order) => order.driver_id)
          .filter((driverId): driverId is string => Boolean(driverId))
      )
    );
    const drivers = driverIds.length
      ? await getPrisma().consumer.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, name: true },
        })
      : [];
    const driverNameById = new Map(drivers.map((driver) => [driver.id, driver.name]));

    return {
      orders: orders.map((order) => mapDistributorQueueOrder(order, driverNameById)),
      total,
      page: query.page,
      totalPages: Math.ceil(total / query.limit),
      limit: query.limit,
      summary: buildDistributorQueueSummary(statusCounts),
      filters: {
        stage: query.stage,
        status: query.status ?? null,
        q: query.q ?? null,
        origin: query.origin,
        deliveryDate: query.deliveryDate ?? null,
        start: query.start ?? null,
        end: query.end ?? null,
        driverId: query.driverId ?? null,
        sort: query.sort,
      },
    };
  },

  /**
   * Busca pedido por ID com timeline de eventos
   */
  async findByIdWithTimeline(orderId: string) {
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

  /**
   * Lista pedidos conforme role e scope do usuário.
   */
  async listOrders(
    userId: string,
    role: string,
    scope?: string,
    statusParam?: string,
    page = 1,
    limit = 10,
    statusGroup?: string
  ) {
    if (scope === "distributor") {
      const status = DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES.includes(statusParam as never)
        ? (statusParam as DistributorQueueQueryInput["status"])
        : undefined;

      return orderQueryService.listDistributorQueue(userId, role, {
        scope: "distributor",
        stage: "all",
        status,
        origin: "all",
        sort: "created_desc",
        page: Math.max(1, page),
        limit: Math.min(50, Math.max(1, limit)),
      });
    }

    if (scope === "support") {
      if (role !== "support" && role !== "ops") {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      return []; // caller must use searchOrders()
    }

    if (role === "consumer") {
      const validGroups = ["all", "active", "delivered", "cancelled"] as const;
      type StatusGroup = (typeof validGroups)[number];
      const group: StatusGroup = validGroups.includes(statusGroup as StatusGroup)
        ? (statusGroup as StatusGroup)
        : "all";

      const safeLimit = Math.min(50, Math.max(1, limit));
      const safePage = Math.max(1, page);

      const { orders, total, summary } = await orderRepository.findByConsumerPaged(userId, {
        statusGroup: group,
        page: safePage,
        limit: safeLimit,
      });

      return {
        orders,
        total,
        page: safePage,
        totalPages: Math.ceil(total / safeLimit),
        limit: safeLimit,
        summary,
      };
    }

    if (role === "ops" || role === "support") {
      return orderRepository.findAll({
        limit: 100,
        ...(statusParam ? { status: statusParam as OrderStatus } : {}),
      });
    }

    return [];
  },

  /**
   * Busca de pedidos por support (phone, email, id).
   */
  async searchOrders(query: string) {
    return orderRepository.searchBySupport(query);
  },

  /**
   * Busca pedido por ID com itens e timeline formatados.
   */
  async getOrderDetail(orderId: string, role: string) {
    const result = await orderRepository.findByIdWithDetails(orderId);
    if (!result) return null;

    const subscriptionContext = buildDistributorOrderOriginContext(result);
    const {
      items,
      audit_events,
      consumer,
      address,
      distributor,
      zone,
      time_slot,
      driver,
      payments,
      deposits,
      otps,
      subscription_delivery_date: _subscriptionDeliveryDate,
      ...order
    } = result;
    const totalItemsQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const addressParts = [
      `${address.street}, ${address.number}`,
      address.complement,
      address.neighborhood,
      `${address.city}/${address.state}`,
    ].filter(Boolean);

    const slaDeadline =
      order.status === OrderStatus.SENT_TO_DISTRIBUTOR
        ? new Date(new Date(order.created_at).getTime() + 15 * 60 * 1000).toISOString()
        : null;

    return {
      ...order,
      ...subscriptionContext,
      subscription_delivery_date: undefined,
      consumer_name: consumer.name,
      consumer_email: consumer.email,
      consumer_phone: consumer.phone,
      distributor_name: distributor.name,
      distributor_phone: distributor.phone,
      distributor_email: distributor.email,
      driver_name: driver?.name ?? null,
      driver_phone: driver?.phone ?? null,
      zone_name: zone.name,
      time_slot: time_slot
        ? {
            label: time_slot.label,
            start_hour: time_slot.start_hour,
            start_minute: time_slot.start_minute,
            end_hour: time_slot.end_hour,
            end_minute: time_slot.end_minute,
          }
        : null,
      address_line: addressParts.join(" - "),
      address_details: {
        street: address.street,
        number: address.number,
        complement: address.complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        zip_code: address.zip_code,
      },
      sla_deadline: slaDeadline,
      total_items_qty: totalItemsQty,
      items: items.map((i) => ({
        product_name: i.product_name,
        qty: i.quantity,
        unit_price_cents: i.unit_price_cents,
        subtotal_cents: i.subtotal_cents,
        image_url: i.product.image_url ?? null,
      })),
      events: audit_events.map((e) => ({
        status: e.event_type,
        timestamp: e.occurred_at,
        actor: e.actor_id,
        actor_type: e.actor_type,
        source_app: e.source_app,
        payload: e.payload,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        kind: payment.kind,
        status: payment.status,
        amount_cents: payment.amount_cents,
        payment_method: payment.payment_method,
        cash_change_for_cents: payment.cash_change_for_cents,
        provider: payment.provider,
        paid_at: payment.paid_at,
        created_at: payment.created_at,
      })),
      deposits: deposits.map((deposit) => ({
        id: deposit.id,
        amount_cents: deposit.amount_cents,
        status: deposit.status,
        refunded_at: deposit.refunded_at,
        created_at: deposit.created_at,
      })),
      otps: otps.map((otp) => ({
        id: otp.id,
        status: otp.status,
        attempts: otp.attempts,
        expires_at: otp.expires_at,
        created_at: otp.created_at,
      })),
      // SEC: o código OTP só é devolvido ao próprio consumidor — motoristas devem
      // validá-lo via action "verify_otp" (digitado pelo cliente), nunca lendo-o da API.
      otp_code: role === "consumer" ? (await redis.get(`otp:${orderId}`) ?? undefined) : undefined,
    };
  },
};
