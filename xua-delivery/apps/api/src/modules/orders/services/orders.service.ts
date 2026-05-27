import { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  DeliveryDateStatus,
  DeliveryWindow,
  InventoryMovementType,
  InventoryReferenceType,
  OrderStatus,
  PaymentKind,
  SourceApp,
} from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { getIO } from "../../../infra/socket/gateway.js";
import { orderRepository, type OrderForQueue, type OrderWithItems } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { inventoryRepository } from "../../inventory/repository/inventory.repository.js";
import { inventoryService, InventoryServiceError } from "../../inventory/services/inventory.service.js";
import { capacityService } from "../../distributor/services/capacity.service.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { depositService } from "../../consumers/services/deposit.service.js";
import { notificationService } from "../../notifications/services/notification.service.js";
import { paymentService } from "../../payments/services/payments.service.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import redis from "../../../infra/redis/client.js";

const log = createLogger("orders");

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

type OrderInventoryLine = {
  productId: string;
  productName: string;
  quantity: number;
  inventoryItemId: string;
  inventoryItemCode: string;
  inventoryItemName: string;
};

type StockReturnOptions = {
  returnToStock?: boolean;
};

const CANCEL_AUTO_RETURN_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
]);

const CANCEL_EXPLICIT_RETURN_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
]);

function translateInventoryError(error: unknown): never {
  if (error instanceof InventoryServiceError) {
    throw new OrderServiceError(error.code, error.message);
  }

  throw error;
}

function aggregateOrderItems(order: OrderWithItems): Array<{
  productId: string;
  productName: string;
  quantity: number;
}> {
  const byProduct = new Map<string, { productId: string; productName: string; quantity: number }>();

  for (const item of order.items) {
    const current = byProduct.get(item.product_id);
    if (current) {
      current.quantity += item.quantity;
      continue;
    }

    byProduct.set(item.product_id, {
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
    });
  }

  return [...byProduct.values()];
}

async function resolveOrderInventoryLines(
  order: OrderWithItems,
  tx: TxClient
): Promise<OrderInventoryLine[]> {
  const lines = aggregateOrderItems(order);
  if (lines.length === 0) {
    throw new OrderServiceError("ORDER_ITEM_NOT_FOUND", "Pedido sem itens para movimentar estoque");
  }

  const inventoryItems = await inventoryRepository.findActiveInventoryItemsByProductIds(
    lines.map((line) => line.productId),
    tx
  );

  const inventoryItemsByProduct = new Map<string, typeof inventoryItems>();
  for (const inventoryItem of inventoryItems) {
    if (!inventoryItem.product_id) continue;
    inventoryItemsByProduct.set(inventoryItem.product_id, [
      ...(inventoryItemsByProduct.get(inventoryItem.product_id) ?? []),
      inventoryItem,
    ]);
  }

  return lines.map((line) => {
    const mappedItems = inventoryItemsByProduct.get(line.productId) ?? [];

    if (mappedItems.length === 0) {
      log.warn(
        { orderId: order.id, distributorId: order.distributor_id, productId: line.productId },
        "Order inventory mapping missing"
      );
      throw new OrderServiceError(
        "INVENTORY_ITEM_NOT_FOUND",
        "Produto sem item de estoque ativo vinculado"
      );
    }

    if (mappedItems.length > 1) {
      log.warn(
        {
          orderId: order.id,
          distributorId: order.distributor_id,
          productId: line.productId,
          inventoryItemIds: mappedItems.map((item) => item.id),
        },
        "Order inventory mapping is ambiguous"
      );
      throw new OrderServiceError(
        "INVENTORY_ITEM_CONFLICT",
        "Produto vinculado a mais de um item de estoque ativo"
      );
    }

    const inventoryItem = mappedItems[0];
    return {
      ...line,
      inventoryItemId: inventoryItem.id,
      inventoryItemCode: inventoryItem.code,
      inventoryItemName: inventoryItem.name,
    };
  });
}

async function assertStockAvailableForOrder(
  order: OrderWithItems,
  lines: OrderInventoryLine[],
  tx: TxClient
): Promise<void> {
  for (const line of lines) {
    const balance = await inventoryRepository.findBalanceForUpdate(
      order.distributor_id,
      line.inventoryItemId,
      tx
    );
    const quantityOnHand = balance?.quantity_on_hand ?? 0;

    if (quantityOnHand < line.quantity) {
      log.warn(
        {
          orderId: order.id,
          distributorId: order.distributor_id,
          productId: line.productId,
          inventoryItemId: line.inventoryItemId,
          requestedQuantity: line.quantity,
          quantityOnHand,
        },
        "Order acceptance rejected because stock is unavailable"
      );

      throw new OrderServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente para aceitar pedido");
    }
  }
}

async function applyOrderInventoryMovements(params: {
  order: OrderWithItems;
  lines: OrderInventoryLine[];
  movementType: InventoryMovementType;
  quantityDirection: 1 | -1;
  actor: { type: ActorType; id: string };
  sourceApp: SourceApp;
  metadata: Record<string, unknown>;
  tx: TxClient;
}): Promise<void> {
  for (const line of params.lines) {
    try {
      await inventoryService.applyMovement(
        {
          distributorId: params.order.distributor_id,
          inventoryItemId: line.inventoryItemId,
          quantityDelta: params.quantityDirection * line.quantity,
          movementType: params.movementType,
          actor: params.actor,
          sourceApp: params.sourceApp,
          reference: { type: InventoryReferenceType.ORDER, id: params.order.id },
          metadata: {
            ...params.metadata,
            order_id: params.order.id,
            distributor_id: params.order.distributor_id,
            product_id: line.productId,
            product_name: line.productName,
            inventory_item_id: line.inventoryItemId,
            inventory_item_code: line.inventoryItemCode,
            quantity: line.quantity,
          },
        },
        params.tx
      );
    } catch (error) {
      translateInventoryError(error);
    }
  }
}

function shouldReturnCancelledOrderToStock(
  previousStatus: string,
  options?: StockReturnOptions
): boolean {
  if (options?.returnToStock === false) return false;
  if (options?.returnToStock === true) return CANCEL_EXPLICIT_RETURN_STATUSES.has(previousStatus);
  return CANCEL_AUTO_RETURN_STATUSES.has(previousStatus);
}

function inventoryAuditLines(lines: OrderInventoryLine[]) {
  return lines.map((line) => ({
    product_id: line.productId,
    inventory_item_id: line.inventoryItemId,
    quantity: line.quantity,
  }));
}

/**
 * Snapshot do horário de entrega gravado no próprio pedido (Order),
 * de forma a não depender de TimeSlot que pode ser alterado/removido depois.
 *
 * Prioridade:
 *   1. TimeSlot referenciado (label + faixa exatas configuradas pela distribuidora)
 *   2. preferred_time_start/end (faixa customizada do consumidor)
 *   3. Fallback determinístico por DeliveryWindow (MORNING 08:00-12:00, AFTERNOON 13:00-18:00)
 */
type ScheduledTimeSnapshot = {
  label: string | null;
  startHour: number | null;
  startMinute: number | null;
  endHour: number | null;
  endMinute: number | null;
};

const WINDOW_FALLBACK: Record<DeliveryWindow, { label: string; startHour: number; endHour: number }> = {
  [DeliveryWindow.MORNING]: { label: "Manhã (08:00–12:00)", startHour: 8, endHour: 12 },
  [DeliveryWindow.AFTERNOON]: { label: "Tarde (13:00–18:00)", startHour: 13, endHour: 18 },
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

type NewSubscriptionDeliveryContext = NonNullable<OrderForQueue["subscription_delivery_date"]>;

type DistributorOrderOriginContext = {
  order_origin: "cart" | "subscription";
  user_subscription_id: string | null;
  subscription_delivery_date_id: string | null;
  subscription_plan_name: string | null;
  subscription_status: string | null;
  subscription_delivery_status: string | null;
  delivery_sequence: number | null;
  total_deliveries: number | null;
  completed_deliveries: number | null;
  remaining_deliveries: number | null;
  remaining_after_current: number | null;
  quantity_for_this_delivery: number | null;
  subscription_total_quantity: number | null;
  subscription_remaining_quantity: number | null;
};

const CART_ORDER_CONTEXT: DistributorOrderOriginContext = {
  order_origin: "cart",
  user_subscription_id: null,
  subscription_delivery_date_id: null,
  subscription_plan_name: null,
  subscription_status: null,
  subscription_delivery_status: null,
  delivery_sequence: null,
  total_deliveries: null,
  completed_deliveries: null,
  remaining_deliveries: null,
  remaining_after_current: null,
  quantity_for_this_delivery: null,
  subscription_total_quantity: null,
  subscription_remaining_quantity: null,
};

function isCancelledDeliveryDate(status: unknown): boolean {
  return status === DeliveryDateStatus.CANCELLED || status === "cancelled";
}

function sortSubscriptionDeliveryDates(
  deliveryDates: NewSubscriptionDeliveryContext["user_subscription"]["delivery_dates"]
) {
  return [...deliveryDates].sort((a, b) => {
    const dateDiff = new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function buildDistributorOrderOriginContext(order: {
  subscription_delivery_date?: NewSubscriptionDeliveryContext | null;
}): DistributorOrderOriginContext {
  const subscriptionDeliveryDate = order.subscription_delivery_date;
  if (!subscriptionDeliveryDate) return CART_ORDER_CONTEXT;

  const userSubscription = subscriptionDeliveryDate.user_subscription;
  const deliveryDates = sortSubscriptionDeliveryDates(userSubscription.delivery_dates).filter(
    (deliveryDate) =>
      deliveryDate.id === subscriptionDeliveryDate.id || !isCancelledDeliveryDate(deliveryDate.status)
  );
  const deliveryIndex = deliveryDates.findIndex(
    (deliveryDate) => deliveryDate.id === subscriptionDeliveryDate.id
  );
  const deliverySequence = deliveryIndex >= 0 ? deliveryIndex + 1 : null;
  const totalDeliveries = deliveryDates.length || null;
  const completedDeliveries = deliverySequence == null ? null : Math.max(deliverySequence - 1, 0);
  const remainingAfterCurrent =
    deliverySequence == null || totalDeliveries == null
      ? null
      : Math.max(totalDeliveries - deliverySequence, 0);

  return {
    order_origin: "subscription",
    user_subscription_id: userSubscription.id,
    subscription_delivery_date_id: subscriptionDeliveryDate.id,
    subscription_plan_name: userSubscription.plan.name,
    subscription_status: userSubscription.status,
    subscription_delivery_status: subscriptionDeliveryDate.status,
    delivery_sequence: deliverySequence,
    total_deliveries: totalDeliveries,
    completed_deliveries: completedDeliveries,
    remaining_deliveries: remainingAfterCurrent,
    remaining_after_current: remainingAfterCurrent,
    quantity_for_this_delivery: subscriptionDeliveryDate.quantity_for_this_delivery,
    subscription_total_quantity: userSubscription.total_quantity,
    subscription_remaining_quantity: userSubscription.remaining_quantity,
  };
}

async function resolveScheduledTimeSnapshot(
  tx: TxClient,
  input: {
    timeSlotId: string | null;
    distributorId: string;
    deliveryWindow: DeliveryWindow;
    preferredTimeStart: number | null;
    preferredTimeEnd: number | null;
  }
): Promise<ScheduledTimeSnapshot> {
  if (input.timeSlotId) {
    const slot = await tx.timeSlot.findFirst({
      where: { id: input.timeSlotId, distributor_id: input.distributorId },
      select: {
        label: true,
        start_hour: true,
        start_minute: true,
        end_hour: true,
        end_minute: true,
      },
    });
    if (slot) {
      return {
        label: slot.label,
        startHour: slot.start_hour,
        startMinute: slot.start_minute,
        endHour: slot.end_hour,
        endMinute: slot.end_minute,
      };
    }
  }

  if (input.preferredTimeStart != null && input.preferredTimeEnd != null) {
    return {
      label: `${pad2(input.preferredTimeStart)}:00–${pad2(input.preferredTimeEnd)}:00`,
      startHour: input.preferredTimeStart,
      startMinute: 0,
      endHour: input.preferredTimeEnd,
      endMinute: 0,
    };
  }

  const fb = WINDOW_FALLBACK[input.deliveryWindow];
  return {
    label: fb.label,
    startHour: fb.startHour,
    startMinute: 0,
    endHour: fb.endHour,
    endMinute: 0,
  };
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
    distributorSelectionMode: "manual" | "auto";
    timeSlotId?: string | null;
    preferredTimeStart?: number | null;
    preferredTimeEnd?: number | null;
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
      const totalCents = subtotalCents + depositAmountCents;

      // Valida agenda da distribuidora (dias ativos, datas bloqueadas, lead_time)
      await scheduleService.validateDeliveryDate(
        data.distributorId,
        data.deliveryDate,
        data.deliveryWindow,
      );

      // ARCH-04: Reserva capacidade dentro da mesma transação
      await capacityService.reserve(
        data.zoneId,
        data.deliveryDate,
        data.deliveryWindow,
        tx,
        data.timeSlotId,
      );

      // Snapshot imutável do horário de entrega no momento da criação.
      // Garante que alterações futuras em TimeSlot não afetem o histórico do pedido.
      const scheduledSnapshot = await resolveScheduledTimeSnapshot(tx, {
        timeSlotId: data.timeSlotId ?? null,
        distributorId: data.distributorId,
        deliveryWindow: data.deliveryWindow,
        preferredTimeStart: data.preferredTimeStart ?? null,
        preferredTimeEnd: data.preferredTimeEnd ?? null,
      });

      const created = await orderRepository.create(
        {
          consumer_id: data.consumerId,
          address_id: data.addressId,
          distributor_id: data.distributorId,
          zone_id: data.zoneId,
          status: OrderStatus.CREATED,
          delivery_date: new Date(data.deliveryDate),
          delivery_window: data.deliveryWindow,
          time_slot_id: data.timeSlotId ?? null,
          preferred_time_start: data.preferredTimeStart ?? null,
          preferred_time_end: data.preferredTimeEnd ?? null,
          scheduled_time_label: scheduledSnapshot.label,
          scheduled_time_start_hour: scheduledSnapshot.startHour,
          scheduled_time_start_minute: scheduledSnapshot.startMinute,
          scheduled_time_end_hour: scheduledSnapshot.endHour,
          scheduled_time_end_minute: scheduledSnapshot.endMinute,
          subtotal_cents: subtotalCents,
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
          payload: { distributor_selection_mode: data.distributorSelectionMode },
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

    log.info({ orderId: order.id }, "Order created");
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
    }, { maxWait: 10000, timeout: 10000 });

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
    }, { maxWait: 10000, timeout: 10000 });

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
    }, { maxWait: 10000, timeout: 10000 });

    // Socket.io pós-commit: notifica distribuidor (sala da empresa)
    const io = getIO();
    io.to(`distributor:${order.distributor_id}`).emit("new_order", {
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
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.ACCEPTED_BY_DISTRIBUTOR);

      const inventoryLines = await resolveOrderInventoryLines(current, tx);
      await assertStockAvailableForOrder(current, inventoryLines, tx);

      await applyOrderInventoryMovements({
        order: current,
        lines: inventoryLines,
        movementType: InventoryMovementType.ORDER_ACCEPT_OUT,
        quantityDirection: -1,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        metadata: {
          origin: "order_acceptance",
          previous_status: current.status,
          new_status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
        },
        tx,
      });

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
          payload: {
            inventory_movement_type: InventoryMovementType.ORDER_ACCEPT_OUT,
            inventory_items: inventoryAuditLines(inventoryLines),
          },
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
   * Checklist + Dispatch atômico: ACCEPTED_BY_DISTRIBUTOR → READY_FOR_DISPATCH → OUT_FOR_DELIVERY
   * Faz as duas transições em uma única transação para evitar estado inconsistente.
   */
  async dispatchWithChecklist(orderId: string, distributorUserId: string, driverId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");

      // Transição 1: ACCEPTED_BY_DISTRIBUTOR → READY_FOR_DISPATCH
      assertTransition(current.status, OrderStatus.READY_FOR_DISPATCH);
      await orderRepository.updateStatus(orderId, OrderStatus.READY_FOR_DISPATCH, undefined, tx);

      await auditRepository.emit(
        {
          eventType: AuditEventType.DISPATCH_CHECKLIST_COMPLETED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
        },
        tx
      );

      // Transição 2: READY_FOR_DISPATCH → OUT_FOR_DELIVERY
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

    io.to(`driver:${driverId}`).emit("new_delivery", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

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
  async markDeliveryFailed(
    orderId: string,
    driverId: string,
    reason: string,
    options?: StockReturnOptions
  ): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.DELIVERY_FAILED);

      const shouldReturnToStock = options?.returnToStock === true;
      const inventoryLines = shouldReturnToStock
        ? await resolveOrderInventoryLines(current, tx)
        : [];

      if (shouldReturnToStock) {
        await applyOrderInventoryMovements({
          order: current,
          lines: inventoryLines,
          movementType: InventoryMovementType.DELIVERY_FAILED_RETURN,
          quantityDirection: 1,
          actor: { type: ActorType.DRIVER, id: driverId },
          sourceApp: SourceApp.DRIVER_WEB,
          metadata: {
            origin: "delivery_failed_return",
            previous_status: current.status,
            new_status: OrderStatus.DELIVERY_FAILED,
            reason,
            physical_return_confirmed: true,
          },
          tx,
        });
      }

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
          payload: {
            reason,
            type: "DELIVERY_FAILED",
            physical_return_confirmed: shouldReturnToStock,
            inventory_movement_type: shouldReturnToStock
              ? InventoryMovementType.DELIVERY_FAILED_RETURN
              : null,
            inventory_items: inventoryAuditLines(inventoryLines),
          },
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
    actorType: "consumer" | "ops" | "distributor" | "driver",
    reason: string,
    options?: StockReturnOptions
  ): Promise<Order> {
    const actorMap: Record<string, ActorType> = {
      consumer: ActorType.CONSUMER,
      ops: ActorType.OPS,
      distributor: ActorType.DISTRIBUTOR_USER,
      driver: ActorType.DRIVER,
    };
    const sourceAppMap: Record<string, SourceApp> = {
      consumer: SourceApp.CONSUMER_WEB,
      ops: SourceApp.OPS_CONSOLE,
      distributor: SourceApp.DISTRIBUTOR_WEB,
      driver: SourceApp.DRIVER_WEB,
    };
    const actor = actorMap[actorType];
    const sourceApp = sourceAppMap[actorType];

    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.CANCELLED);

      const shouldReturnToStock = shouldReturnCancelledOrderToStock(current.status, options);
      const inventoryLines = shouldReturnToStock
        ? await resolveOrderInventoryLines(current, tx)
        : [];

      if (shouldReturnToStock) {
        await applyOrderInventoryMovements({
          order: current,
          lines: inventoryLines,
          movementType: InventoryMovementType.ORDER_CANCEL_RETURN,
          quantityDirection: 1,
          actor: { type: actor, id: actorId },
          sourceApp,
          metadata: {
            origin: "order_cancellation_return",
            previous_status: current.status,
            new_status: OrderStatus.CANCELLED,
            reason,
            physical_return_confirmed: true,
          },
          tx,
        });
      }

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
          payload: {
            reason,
            previous_status: current.status,
            physical_return_confirmed: shouldReturnToStock,
            inventory_movement_type: shouldReturnToStock
              ? InventoryMovementType.ORDER_CANCEL_RETURN
              : null,
            inventory_items: inventoryAuditLines(inventoryLines),
          },
        },
        tx
      );

      // Libera capacidade se estava reservada
      await capacityService.release(
        current.zone_id,
        current.delivery_date.toISOString().split("T")[0],
        current.delivery_window,
        tx,
        current.time_slot_id,
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

      let emptyReturnInventoryItem: Awaited<
        ReturnType<typeof inventoryRepository.findActiveReturnableEmptyItem>
      > = null;

      if (data.returnedQty > 0) {
        emptyReturnInventoryItem = await inventoryRepository.findActiveReturnableEmptyItem(tx);
        if (emptyReturnInventoryItem) {
          try {
            await inventoryService.applyMovement(
              {
                distributorId: current.distributor_id,
                inventoryItemId: emptyReturnInventoryItem.id,
                quantityDelta: data.returnedQty,
                movementType: InventoryMovementType.EMPTY_RETURN_IN,
                actor: { type: ActorType.DRIVER, id: driverId },
                sourceApp: SourceApp.DRIVER_WEB,
                reference: { type: InventoryReferenceType.ORDER, id: orderId },
                metadata: {
                  origin: "bottle_exchange",
                  order_id: orderId,
                  distributor_id: current.distributor_id,
                  driver_id: driverId,
                  returned_empty_qty: data.returnedQty,
                  collected_empty_qty: data.collectedQty,
                  bottle_condition: data.condition ?? null,
                  inventory_item_id: emptyReturnInventoryItem.id,
                  inventory_item_code: emptyReturnInventoryItem.code,
                },
              },
              tx
            );
          } catch (error) {
            translateInventoryError(error);
          }
        } else {
          log.warn(
            { orderId, distributorId: current.distributor_id, returnedQty: data.returnedQty },
            "Bottle exchange recorded without returnable empty inventory item"
          );
        }
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
          payload: {
            ...data,
            inventory_movement_type:
              data.returnedQty > 0 && emptyReturnInventoryItem
                ? InventoryMovementType.EMPTY_RETURN_IN
                : null,
            inventory_item_id: emptyReturnInventoryItem?.id ?? null,
          },
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
      if (role !== "distributor_admin") {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      const prisma = getPrisma();
      const distributorId = await distributorRepository.resolveDistributorId(userId);
      if (!distributorId) {
        throw new OrderServiceError("FORBIDDEN", "Usuário não vinculado a nenhuma distribuidora");
      }

      // Statuses ativos visíveis na fila. Se vier filtro explícito, usa ele; senão mostra todos ativos.
      const QUEUE_STATUSES: OrderStatus[] = [
        OrderStatus.SENT_TO_DISTRIBUTOR,
        OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
        OrderStatus.READY_FOR_DISPATCH,
        OrderStatus.OUT_FOR_DELIVERY,
      ];
      const statuses = statusParam
        ? [statusParam as OrderStatus]
        : QUEUE_STATUSES;

      const orders = await orderRepository.findByDistributor(distributorId, statuses);

      const driverIds = Array.from(
        new Set(
          orders
            .map((order) => order.driver_id)
            .filter((driverId): driverId is string => Boolean(driverId))
        )
      );

      const drivers = driverIds.length
        ? await prisma.consumer.findMany({
            where: { id: { in: driverIds } },
            select: { id: true, name: true },
          })
        : [];

      const driverNameById = new Map(drivers.map((driver) => [driver.id, driver.name]));

      // Enriquecer com campos calculados esperados pelo frontend
      const SLA_MS = 15 * 60 * 1000; // 15 minutos de SLA de aceitação
      return orders.map((o) => {
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
          sla_deadline: new Date(new Date(o.created_at).getTime() + SLA_MS).toISOString(),
          consumer: undefined,
          address: undefined,
          items: undefined,
          subscription_delivery_date: undefined,
        };
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
  async getOrderDetail(orderId: string) {
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
      otp_code: await redis.get(`otp:${orderId}`) ?? undefined,
    };
  },

  /**
   * Simula o fluxo completo de pagamento quando PAYMENT_PROVIDER=mock.
   * CREATED → PAYMENT_PENDING → CONFIRMED → SENT_TO_DISTRIBUTOR
   */
  async autoSimulateMockPayment(orderId: string, totalCents: number): Promise<void> {
    const provider = process.env.PAYMENT_PROVIDER ?? "mock";
    if (provider !== "mock") return;

    try {
      await orderService.submitForPayment(orderId);
      const { payment } = await paymentService.charge(orderId, totalCents, PaymentKind.ORDER);
      if (payment.status === "CAPTURED") {
        await orderService.confirmOrder(orderId);
        await orderService.sendToDistributor(orderId);
      }
      log.info({ orderId }, "[MOCK] Pagamento simulado — pedido enviado ao distribuidor");
    } catch (err) {
      log.warn({ orderId, err }, "[MOCK] Falha na simulação de pagamento, pedido permanece em CREATED");
    }
  },
};
