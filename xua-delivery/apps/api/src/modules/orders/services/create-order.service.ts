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
  DEFAULT_CHECKOUT_PAYMENT_METHOD,
  isCashPaymentMethod,
  isOfflinePaymentMethod,
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
  /** Legado: ignorado. Os vazios passaram a ser registrados pelo motorista na entrega. */
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
  /** Dinheiro ou cartão na maquininha: pago na entrega, não passa pelo gateway. */
  isOfflinePayment: boolean;
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
  const { paymentMethod, isOfflinePayment, isCashPayment, prepaid, subtotalCents, cashChangeForCents } =
    ctx;

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

  // Regra de vasilhame na entrega: o pedido nasce cobrando só os produtos.
  // Cada unidade de refil exige 1 vazio na porta; o que faltar é resolvido pelo
  // motorista na entrega (cobrar o vasilhame, entregar parcial ou cancelar).
  // Aqui só se registra a demanda de vazios e o teto informado ao cliente.
  const bottleGroups = await depositSettlementService.resolveBottleGroups(
    data.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    tx
  );
  const bottlesFullOrdered = bottleGroups.reduce((acc, g) => acc + g.bottlesOrdered, 0);
  const maxBottleChargeCents = bottleGroups.reduce(
    (acc, g) => acc + g.bottlesOrdered * g.bottleUnitPriceCents,
    0
  );
  const totalCents = subtotalCents;

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

  // Pré-pago e pago na entrega (dinheiro/cartão na maquininha) nascem
  // CONFIRMED; só os métodos online aguardam o gateway (CREATED).
  const confirmedAtCreation = prepaid || isOfflinePayment;
  const initialStatus = confirmedAtCreation ? OrderStatus.CONFIRMED : OrderStatus.CREATED;
  const initialPaymentStatus = prepaid
    ? PAYMENT_PAID_STATUS
    : isOfflinePayment
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
      // Vasilhames: demanda de vazios e teto da cobrança na porta. Venda e
      // caução efetivas só são conhecidas na entrega (order-bottle.service).
      bottles_full_ordered: bottlesFullOrdered,
      empty_bottles_provided: 0,
      bottles_sold: 0,
      bottles_loaned: 0,
      max_bottle_charge_cents: maxBottleChargeCents,
      bottle_charge_cents: 0,
      rating: null,
      rating_comment: null,
      nps_score: null,
      nps_comment: null,
      collected_empty_qty: 0,
      returned_empty_qty: null,
      bottle_condition: null,
      empty_not_collected_reason: null,
      empty_not_collected_notes: null,
      // Passo de vasilhame ainda não cumprido — só o motorista o registra, na
      // entrega. Nulo é o estado correto de um pedido recém-criado.
      bottle_step_recorded_at: null,
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

  await orderRepository.createItems(created.id, data.items, tx);

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

  if (isOfflinePayment && !prepaid) {
    const payment = await tx.payment.create({
      data: {
        order_id: created.id,
        kind: PaymentKind.ORDER,
        status: PaymentStatus.CREATED,
        amount_cents: totalCents,
        payment_method: paymentMethod,
        provider: CASH_PAYMENT_PROVIDER,
        cash_change_for_cents: isCashPayment ? cashChangeForCents : null,
      },
    });

    await auditRepository.emit(
      {
        eventType: AuditEventType.PAYMENT_CREATED,
        actor: { type: ActorType.SYSTEM, id: "pay-on-delivery" },
        orderId: created.id,
        sourceApp: SourceApp.BACKEND,
        payload: {
          payment_id: payment.id,
          payment_method: paymentMethod,
          cash_change_for_cents: isCashPayment ? cashChangeForCents : null,
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
          : { type: ActorType.SYSTEM, id: "pay-on-delivery" },
        orderId: created.id,
        sourceApp: SourceApp.BACKEND,
        payload: prepaid ? { prepaid: true } : { payment_method: paymentMethod },
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
    const isOfflinePayment = isOfflinePaymentMethod(paymentMethod);
    const cashChangeForCents = data.cashChangeForCents ?? null;
    const subtotalCents = data.items.reduce(
      (acc, i) => acc + i.unit_price_cents * i.quantity,
      0
    );

    const order = await prisma.$transaction((tx: TxClient) =>
      buildOrderInTx(tx, data, {
        paymentMethod,
        isOfflinePayment,
        isCashPayment,
        prepaid: false,
        subtotalCents,
        cashChangeForCents,
        paymentSettingsPromise,
      })
    );

    log.info({ orderId: order.id }, "Order created");
    if (isOfflinePayment) {
      const sent = await createOrderService.sendToDistributor(order.id);
      log.info({ orderId: sent.id, paymentMethod }, "Pay-on-delivery order sent to distributor");
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
      isOfflinePayment: false,
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
