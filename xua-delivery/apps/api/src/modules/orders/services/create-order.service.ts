import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  DeliveryWindow,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
  type CheckoutPaymentMethod,
} from "@xua/shared/enums";
import {
  CASH_PAYMENT_METHOD,
  DEFAULT_CHECKOUT_PAYMENT_METHOD,
  isCashPaymentMethod,
} from "@xua/shared/mappers/payment";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { depositSettlementService } from "../../deposits/services/deposit-settlement.service.js";
import {
  distributorGatewayService,
  isPaymentMethodAllowed,
  DEFAULT_PUBLIC_PAYMENT_METHODS,
} from "../../distributor-gateway/index.js";
import { createLogger } from "../../../infra/logger/index.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import {
  CASH_PAYMENT_PROVIDER,
  CASH_PAYMENT_PENDING_STATUS,
  PAYMENT_PAID_STATUS,
} from "./payment-constants.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

interface CreateOrderData {
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
  deliveryInstructions?: string | null;
  paymentMethod?: CheckoutPaymentMethod;
  cashChangeForCents?: number | null;
  bypassLeadTime?: boolean;
  /**
   * Pula a checagem de método de pagamento x config da distribuidora.
   * Uso restrito a pedidos gerados internamente (ex.: job de assinatura),
   * onde o pagamento já foi capturado fora deste fluxo (subtotal = 0) e o
   * `paymentMethod` aqui é só metadado — não há nada a proteger validando.
   */
  skipPaymentMethodValidation?: boolean;
  /** Vazios declarados pelo consumidor, por tipo de vasilhame (settlement). */
  emptyBottles?: Array<{ bottle_product_id: string; quantity: number }>;
  items: Array<{
    product_id: string;
    product_name: string;
    unit_price_cents: number;
    quantity: number;
  }>;
}

/**
 * Contexto resolvido fora da transação e passado ao corpo transacional.
 * `prepaid` = pedido pré-pago (ex.: assinatura): nasce CONFIRMED, sem registro
 * de Payment (o pagamento vive na assinatura) e payment_status = "paid".
 */
interface BuildOrderContext {
  paymentMethod: CheckoutPaymentMethod;
  isCashPayment: boolean;
  prepaid: boolean;
  subtotalCents: number;
  cashChangeForCents: number | null;
  /** Promise das configurações de pagamento da distribuidora (null se validação pulada). */
  paymentSettingsPromise: ReturnType<typeof distributorGatewayService.getPublicMethods> | null;
}

/**
 * Corpo transacional da criação de pedido. Roda dentro da transação fornecida —
 * permite que chamadores (ex.: geração de assinatura) componham a criação do
 * pedido + outras escritas numa única transação atômica.
 */
async function buildOrderInTx(
  tx: TxClient,
  data: CreateOrderData,
  ctx: BuildOrderContext
): Promise<Order> {
  const { paymentMethod, isCashPayment, prepaid, subtotalCents, cashChangeForCents } = ctx;

  if (!data.skipPaymentMethodValidation) {
    const distributorPaymentSettings = await ctx.paymentSettingsPromise;
    if (
      !isPaymentMethodAllowed(
        paymentMethod,
        distributorPaymentSettings ?? DEFAULT_PUBLIC_PAYMENT_METHODS
      )
    ) {
      log.warn(
        { distributorId: data.distributorId, consumerId: data.consumerId, paymentMethod },
        "createOrder: método de pagamento não permitido pela distribuidora rejeitado"
      );
      throw new OrderServiceError(
        "PAYMENT_METHOD_NOT_ALLOWED",
        "Método de pagamento não disponível para esta distribuidora"
      );
    }
  }

  // Settlement de vasilhames (caução de vasilhames), por vasilhame-produto:
  // - DEFAULT = venda dos vasilhames faltantes → vira item de venda real (vasilhame-produto);
  // - caução só p/ consumidor com vínculo ativo na distribuidora escolhida e dentro do limite.
  // Toda a decisão é do backend; o front só informa vazios por tipo de vasilhame.
  const emptiesByBottle = new Map<string, number>(
    (data.emptyBottles ?? []).map((e) => [e.bottle_product_id, Math.max(0, e.quantity)])
  );
  const bottleGroups = await depositSettlementService.resolveBottleGroups(
    data.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    tx
  );
  const settledBottles = await depositSettlementService.settlePerBottle(
    {
      distributorId: data.distributorId,
      consumerId: data.consumerId,
      groups: bottleGroups,
      emptiesByBottle,
    },
    tx
  );
  const bottleAgg = settledBottles.reduce(
    (acc, s) => {
      acc.fullOrdered += s.bottlesOrdered;
      acc.provided += s.emptiesProvided;
      acc.sold += s.sold;
      acc.loaned += s.loaned;
      acc.soldAmountCents += s.sold * s.bottleUnitPriceCents;
      return acc;
    },
    { fullOrdered: 0, provided: 0, sold: 0, loaned: 0, soldAmountCents: 0 }
  );
  // Itens de venda do vasilhame faltante (adicionados pelo backend).
  const soldBottleItems = settledBottles
    .filter((s) => s.sold > 0)
    .map((s) => ({
      product_id: s.bottleProductId,
      product_name: s.bottleProductName,
      unit_price_cents: s.bottleUnitPriceCents,
      quantity: s.sold,
    }));
  const totalCents = subtotalCents + bottleAgg.soldAmountCents;

  if (!isCashPayment && cashChangeForCents != null) {
    throw new OrderServiceError(
      "INVALID_CASH_CHANGE",
      "Troco só pode ser informado para pagamento em dinheiro"
    );
  }

  if (isCashPayment && cashChangeForCents != null && cashChangeForCents < totalCents) {
    throw new OrderServiceError(
      "INVALID_CASH_CHANGE",
      "Valor para troco deve ser maior ou igual ao total do pedido"
    );
  }

  // Valida agenda da distribuidora (dias ativos, datas bloqueadas, lead_time)
  await scheduleService.validateDeliveryDate(
    data.distributorId,
    data.deliveryDate,
    data.deliveryWindow,
    { bypassLeadTime: data.bypassLeadTime }
  );

  // Snapshot imutável do horário de entrega no momento da criação.
  const scheduledSnapshot = await scheduleService.resolveScheduledTimeSnapshot(tx, {
    timeSlotId: data.timeSlotId ?? null,
    distributorId: data.distributorId,
    deliveryWindow: data.deliveryWindow,
    preferredTimeStart: data.preferredTimeStart ?? null,
    preferredTimeEnd: data.preferredTimeEnd ?? null,
  });

  // Pedido pré-pago e em dinheiro nascem CONFIRMED; online nasce CREATED.
  const confirmedAtCreation = prepaid || isCashPayment;
  const initialStatus = confirmedAtCreation ? OrderStatus.CONFIRMED : OrderStatus.CREATED;
  const initialPaymentStatus = prepaid
    ? PAYMENT_PAID_STATUS
    : isCashPayment
      ? CASH_PAYMENT_PENDING_STATUS
      : null;

  const created = await orderRepository.create(
    {
      consumer_id: data.consumerId,
      address_id: data.addressId,
      distributor_id: data.distributorId,
      zone_id: data.zoneId,
      status: initialStatus,
      delivery_date: new Date(data.deliveryDate),
      delivery_window: data.deliveryWindow,
      // Usa o slot já validado pelo snapshot (existe + pertence à distribuidora).
      // Nunca o `data.timeSlotId` cru: um ID obsoleto violaria a FK do pedido.
      time_slot_id: scheduledSnapshot.timeSlotId,
      preferred_time_start: data.preferredTimeStart ?? null,
      preferred_time_end: data.preferredTimeEnd ?? null,
      delivery_instructions: data.deliveryInstructions ?? null,
      scheduled_time_label: scheduledSnapshot.label,
      scheduled_time_start_hour: scheduledSnapshot.startHour,
      scheduled_time_start_minute: scheduledSnapshot.startMinute,
      scheduled_time_end_hour: scheduledSnapshot.endHour,
      scheduled_time_end_minute: scheduledSnapshot.endMinute,
      subtotal_cents: subtotalCents,
      // Caução financeira v1 removida — zeros exigidos até o drop das colunas (Fase 3).
      deposit_cents: 0,
      total_cents: totalCents,
      // Settlement de vasilhames (agregados; detalhe por tipo nos itens/ledger)
      bottles_full_ordered: bottleAgg.fullOrdered,
      empty_bottles_provided: bottleAgg.provided,
      bottles_sold: bottleAgg.sold,
      bottles_loaned: bottleAgg.loaned,
      rating: null,
      rating_comment: null,
      nps_score: null,
      nps_comment: null,
      collected_empty_qty: 0,
      returned_empty_qty: null,
      bottle_condition: null,
      empty_not_collected_reason: null,
      empty_not_collected_notes: null,
      payment_status: initialPaymentStatus,
      cancellation_reason: null,
      accepted_at: null,
      dispatched_at: null,
      delivered_at: null,
      driver_id: null,
      deposit_amount_cents: 0,
      qty_20l_sent: null,
      qty_20l_returned: null,
    },
    tx
  );

  // Insere items do pedido + vasilhames vendidos (adicionados pelo settlement).
  await orderRepository.createItems(created.id, [...data.items, ...soldBottleItems], tx);

  // Evento de auditoria na mesma transação. Pedidos pré-pagos (assinatura) são
  // criados pelo sistema; checkout normal é criado pelo consumidor.
  await auditRepository.emit(
    {
      eventType: AuditEventType.ORDER_CREATED,
      actor: prepaid
        ? { type: ActorType.SYSTEM, id: "subscription-generation" }
        : { type: ActorType.CONSUMER, id: data.consumerId },
      orderId: created.id,
      sourceApp: prepaid ? SourceApp.BACKEND : SourceApp.CONSUMER_WEB,
      payload: { distributor_selection_mode: data.distributorSelectionMode },
    },
    tx
  );

  if (isCashPayment) {
    const payment = await tx.payment.create({
      data: {
        order_id: created.id,
        kind: PaymentKind.ORDER,
        status: PaymentStatus.CREATED,
        amount_cents: totalCents,
        payment_method: CASH_PAYMENT_METHOD,
        provider: CASH_PAYMENT_PROVIDER,
        cash_change_for_cents: cashChangeForCents,
      },
    });

    await auditRepository.emit(
      {
        eventType: AuditEventType.PAYMENT_CREATED,
        actor: { type: ActorType.SYSTEM, id: "cash-on-delivery" },
        orderId: created.id,
        sourceApp: SourceApp.BACKEND,
        payload: {
          payment_id: payment.id,
          payment_method: CASH_PAYMENT_METHOD,
          cash_change_for_cents: cashChangeForCents,
        },
      },
      tx
    );
  }

  // Pedido confirmado na criação (cash ou pré-pago) emite auditoria de confirmação.
  if (confirmedAtCreation) {
    await auditRepository.emit(
      {
        eventType: AuditEventType.ORDER_CONFIRMED,
        actor: prepaid
          ? { type: ActorType.SYSTEM, id: "subscription-generation" }
          : { type: ActorType.SYSTEM, id: "cash-on-delivery" },
        orderId: created.id,
        sourceApp: SourceApp.BACKEND,
        payload: prepaid ? { prepaid: true } : { payment_method: CASH_PAYMENT_METHOD },
      },
      tx
    );
  }

  return created;
}

/**
 * createOrderService — criação de pedido e seu trajeto inicial até chegar à
 * distribuidora (CREATED/CONFIRMED → PAYMENT_PENDING → CONFIRMED → SENT_TO_DISTRIBUTOR).
 */
export const createOrderService = {
  async createOrder(data: CreateOrderData): Promise<Order> {
    const prisma = getPrisma();
    const paymentMethod = data.paymentMethod ?? DEFAULT_CHECKOUT_PAYMENT_METHOD;

    // Segurança: nunca confiar no método de pagamento exibido pelo frontend.
    // Disparado já aqui (sem await) para correr em paralelo com a primeira
    // query da transação, em vez de somar mais um round-trip sequencial.
    const paymentSettingsPromise = data.skipPaymentMethodValidation
      ? null
      : distributorGatewayService.getPublicMethods(data.distributorId);

    const isCashPayment = isCashPaymentMethod(paymentMethod);
    const cashChangeForCents = data.cashChangeForCents ?? null;
    const subtotalCents = data.items.reduce(
      (acc, i) => acc + i.unit_price_cents * i.quantity,
      0
    );

    const order = await prisma.$transaction((tx: TxClient) =>
      buildOrderInTx(tx, data, {
        paymentMethod,
        isCashPayment,
        prepaid: false,
        subtotalCents,
        cashChangeForCents,
        paymentSettingsPromise,
      })
    );

    log.info({ orderId: order.id }, "Order created");
    if (isCashPayment) {
      const sent = await createOrderService.sendToDistributor(order.id);
      log.info({ orderId: sent.id }, "Cash order sent to distributor");
      return sent;
    }

    return order;
  },

  /**
   * Cria um pedido pré-pago já CONFIRMED dentro da transação do chamador.
   * Usado pela geração de pedidos de assinatura: permite compor, numa única
   * transação atômica, a criação do pedido + a marcação da entrega + o débito
   * do saldo. NÃO chama sendToDistributor (o chamador faz isso no pós-commit).
   */
  async createPrepaidOrderInTx(tx: TxClient, data: CreateOrderData): Promise<Order> {
    const subtotalCents = data.items.reduce(
      (acc, i) => acc + i.unit_price_cents * i.quantity,
      0
    );

    return buildOrderInTx(tx, data, {
      paymentMethod: data.paymentMethod ?? DEFAULT_CHECKOUT_PAYMENT_METHOD,
      isCashPayment: false,
      prepaid: true,
      subtotalCents,
      cashChangeForCents: null,
      paymentSettingsPromise: null,
    });
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
   *
   * Idempotente: se o pedido já está em SENT_TO_DISTRIBUTOR (ou além), é no-op —
   * permite que a geração de assinatura reenvie pedidos presos em CONFIRMED
   * (falha pós-commit) sem erro. Ver D12 da arquitetura.
   */
  async sendToDistributor(orderId: string): Promise<Order> {
    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");

      // Idempotência: já enviado → no-op (não relança transição inválida).
      if (current.status !== OrderStatus.CONFIRMED) {
        return current;
      }

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
    if (order.status === OrderStatus.SENT_TO_DISTRIBUTOR) {
      orderEventsPublisher.notifyDistributor(order.distributor_id, "new_order", {
        orderId,
        status: OrderStatus.SENT_TO_DISTRIBUTOR,
      });
    }

    return order;
  },
};
