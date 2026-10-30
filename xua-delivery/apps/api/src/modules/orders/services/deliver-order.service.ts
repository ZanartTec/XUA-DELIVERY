import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import {
  ActorType,
  AuditEventType,
  InventoryMovementType,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  SourceApp,
} from "@xua/shared/enums";
import { CASH_PAYMENT_METHOD } from "@xua/shared/mappers/payment";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger/index.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { notificationService } from "../../notifications/services/notification.service.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";
import {
  applyOrderInventoryMovements,
  inventoryAuditLines,
  resolveOrderInventoryLines,
} from "./order-inventory.helpers.js";
import {
  CASH_PAYMENT_CAPTURABLE_STATUSES,
  CASH_PAYMENT_INVALID_CAPTURE_STATUSES,
  PAYMENT_PAID_STATUS,
} from "./payment-constants.js";
import { subscriptionSettlementService } from "../../user-subscriptions/services/subscription-settlement.service.js";
import type { DeliveryActor } from "./delivery-actor.js";
import {
  publishBottleStepEvents,
  recordBottleStepInTx,
  type BottleStep,
  type BottleStepResult,
} from "./order-bottle.service.js";

const log = createLogger("orders");

type TxClient = Prisma.TransactionClient;

type StockReturnOptions = {
  returnToStock?: boolean;
};


/**
 * deliverOrderService — desfechos da entrega: sucesso, falha e reagendamento.
 */
export const deliverOrderService = {
  /**
   * Entrega pedido: OUT_FOR_DELIVERY → DELIVERED
   */
  async deliverOrder(
    orderId: string,
    actor: DeliveryActor,
    bottleStep?: BottleStep
  ): Promise<Order> {
    const prisma = getPrisma();
    let bottleStepResult: BottleStepResult | null = null;

    const order = await prisma.$transaction(async (tx: TxClient) => {
      // Leitura com lock: sem ela, duas confirmações concorrentes (motorista com
      // conexão instável tocando duas vezes, ou fila offline sincronizando junto
      // de um envio manual) liam o mesmo estado e ambas seguiam adiante.
      // markDeliveryFailed já lia com lock; deliverOrder era a assimetria.
      const current = await orderRepository.findByIdWithItemsForUpdate(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      assertTransition(current.status, OrderStatus.DELIVERED);

      // O vasilhame é gravado na MESMA transação da conclusão: ou as duas
      // coisas acontecem, ou nenhuma. Antes eram duas requisições em sequência
      // e o pedido já virava DELIVERED na primeira — se o motorista fechasse o
      // app entre uma e outra, a entrega ficava concluída para sempre sem
      // registro de vasilhame.
      if (bottleStep) {
        bottleStepResult = await recordBottleStepInTx(orderId, actor.id, bottleStep, tx);
      }

      const bottleStepRecordedAt =
        bottleStepResult?.order.bottle_step_recorded_at ?? current.bottle_step_recorded_at;

      // Motorista não conclui entrega sem registrar vasilhame. Ops e suporte
      // passam porque o override existe justamente para os casos em que o
      // motorista não consegue reportar (sem sinal, por exemplo) — aí o
      // registro fica como não informado e a auditoria abaixo marca isso.
      if (!bottleStepRecordedAt) {
        if (actor.type === ActorType.DRIVER) {
          throw new OrderServiceError(
            "BOTTLE_STEP_REQUIRED",
            "Registre a troca de vasilhame ou o motivo da não-coleta para concluir a entrega"
          );
        }
        log.warn(
          { orderId, actorId: actor.id, actorType: actor.type, status: current.status },
          "delivered_without_bottle_step"
        );
      }

      const cashPayment = await tx.payment.findFirst({
        where: {
          order_id: orderId,
          kind: PaymentKind.ORDER,
          payment_method: CASH_PAYMENT_METHOD,
        },
        orderBy: { created_at: "desc" },
      });

      if (cashPayment && CASH_PAYMENT_INVALID_CAPTURE_STATUSES.has(cashPayment.status)) {
        throw new OrderServiceError(
          "CASH_PAYMENT_INVALID",
          "Pagamento em dinheiro não está disponível para captura"
        );
      }

      const deliveredAt = new Date();

      if (cashPayment && CASH_PAYMENT_CAPTURABLE_STATUSES.has(cashPayment.status)) {
        await tx.payment.update({
          where: { id: cashPayment.id },
          data: { status: PaymentStatus.CAPTURED, paid_at: deliveredAt },
        });

        await auditRepository.emit(
          {
            eventType: AuditEventType.PAYMENT_CAPTURED,
            actor: { type: actor.type, id: actor.id },
            orderId,
            sourceApp: actor.sourceApp,
            payload: {
              payment_id: cashPayment.id,
              payment_method: CASH_PAYMENT_METHOD,
              amount_cents: cashPayment.amount_cents,
            },
          },
          tx
        );
      }

      const updated = await orderRepository.updateStatus(
        orderId,
        OrderStatus.DELIVERED,
        {
          delivered_at: deliveredAt,
          ...(cashPayment ? { payment_status: PAYMENT_PAID_STATUS } : {}),
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DELIVERED,
          actor: { type: actor.type, id: actor.id },
          orderId,
          sourceApp: actor.sourceApp,
          // Telemetria do Estágio 2A: é por este campo que se mede quantas
          // entregas ainda fecham sem o passo de vasilhame, e portanto quando
          // é seguro ligar o guard estrito.
          payload: {
            bottle_step_recorded: bottleStepRecordedAt != null,
            bottle_step_recorded_at: bottleStepRecordedAt?.toISOString() ?? null,
          },
        },
        tx
      );

      // Compensação de assinatura (no-op se não for pedido de assinatura):
      // entrega concluída → SubscriptionDeliveryDate DELIVERED.
      await subscriptionSettlementService.settleDelivered(tx, orderId);

      return updated;
    });

    if (bottleStepResult) publishBottleStepEvents(bottleStepResult);

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERED,
    });
    // A distribuidora acompanha a fila em tempo real desde o aceite e o
    // despacho, mas parava de receber sinal justamente no desfecho: a entrega
    // só aparecia no painel depois de um refresh manual.
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.DELIVERED);

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

      // REDELIVERY_REQUIRED (e não ORDER_CANCELLED): falha de entrega não é
      // cancelamento. É este evento que alimenta a taxa de reentrega dos
      // painéis de distribuidora e ops — enquanto ele não era emitido, a
      // métrica ficava constante em 0%. Eventos gravados antes de ago/2026
      // continuam como ORDER_CANCELLED e são traduzidos na leitura pelo
      // `resolveEventType` do front.
      await auditRepository.emit(
        {
          eventType: AuditEventType.REDELIVERY_REQUIRED,
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

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERY_FAILED,
    });
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.DELIVERY_FAILED, {
      reason,
    });
    // Falha de entrega exige decisão humana — é ops quem reagenda a reentrega.
    orderEventsPublisher.notifyOps("order_status_changed", {
      orderId,
      status: OrderStatus.DELIVERY_FAILED,
      distributorId: order.distributor_id,
      reason,
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

      // REDELIVERY_SCHEDULED (e não ORDER_CONFIRMED): agendar reentrega não é
      // confirmação de pagamento. Com o evento errado, a timeline do cliente
      // exibia "Pagamento confirmado" logo após uma falha de entrega, dando a
      // entender que ele havia sido cobrado outra vez.
      await auditRepository.emit(
        {
          eventType: AuditEventType.REDELIVERY_SCHEDULED,
          actor: { type: ActorType.OPS, id: opsUserId },
          orderId,
          sourceApp: SourceApp.OPS_CONSOLE,
          payload: { newDate: newDate.toISOString(), type: "REDELIVERY_SCHEDULED" },
        },
        tx
      );

      return updated;
    });

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.REDELIVERY_SCHEDULED,
    });
    // A distribuidora precisa saber para reprogramar a rota do dia.
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.REDELIVERY_SCHEDULED, {
      newDate: newDate.toISOString(),
    });
    orderEventsPublisher.notifyOps("order_status_changed", {
      orderId,
      status: OrderStatus.REDELIVERY_SCHEDULED,
      distributorId: order.distributor_id,
      newDate: newDate.toISOString(),
    });

    return order;
  },
};
