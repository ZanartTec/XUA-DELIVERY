import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { notificationService } from "../../notifications/services/notification.service.js";
import { otpService } from "../../driver/services/otp.service.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { OrderServiceError } from "../errors.js";
import { assertTransition, ASSIGNABLE_DRIVER_STATUSES } from "../state-machine/order-state-machine.js";
import { orderEventsPublisher } from "./order-events.publisher.js";

type TxClient = Prisma.TransactionClient;

async function resolveDistributorIdForUser(distributorUserId: string): Promise<string> {
  const distributorId = await distributorRepository.resolveDistributorId(distributorUserId);
  if (!distributorId) {
    throw new OrderServiceError("FORBIDDEN", "Usuário não vinculado a nenhuma distribuidora");
  }
  return distributorId;
}

async function assertDriverBelongsToDistributor(distributorId: string, driverId: string): Promise<void> {
  const drivers = await distributorRepository.findDriversByDistributor(distributorId);
  if (!drivers.some((driver) => driver.id === driverId)) {
    throw new OrderServiceError("DRIVER_NOT_FOUND", "Motorista não encontrado para esta distribuidora");
  }
}

/**
 * dispatchOrderService — preparação e despacho do pedido para entrega
 * (atribuição de motorista, checklist, dispatch com geração de OTP).
 */
export const dispatchOrderService = {
  async assignDriver(orderId: string, distributorUserId: string, driverId: string): Promise<Order> {
    const distributorId = await resolveDistributorIdForUser(distributorUserId);
    await assertDriverBelongsToDistributor(distributorId, driverId);

    const prisma = getPrisma();
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.distributor_id !== distributorId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      if (!ASSIGNABLE_DRIVER_STATUSES.has(current.status)) {
        throw new OrderServiceError("INVALID_STATUS", "Pedido ainda não pode receber motorista");
      }

      const updated = await orderRepository.update(orderId, { driver_id: driverId }, tx);

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_DRIVER_ASSIGNED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
          orderId,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: { action: "assign_driver", driverId, previous_driver_id: current.driver_id },
        },
        tx
      );

      return updated;
    });

    orderEventsPublisher.distributorOrderStatusChanged(order, order.status as OrderStatus, { driverId });

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

    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.READY_FOR_DISPATCH);

    return order;
  },

  /**
   * Despacha pedido: READY_FOR_DISPATCH → OUT_FOR_DELIVERY
   * Também gera OTP para confirmação de entrega.
   */
  async dispatch(
    orderId: string,
    distributorUserId: string,
    driverId: string
  ): Promise<{ order: Order; otpCode: string }> {
    const distributorId = await resolveDistributorIdForUser(distributorUserId);
    await assertDriverBelongsToDistributor(distributorId, driverId);

    const prisma = getPrisma();
    let otpCode = "";
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.distributor_id !== distributorId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
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

      // OTP é gerado na mesma transação do dispatch: se o commit falhar, o
      // pedido não fica OUT_FOR_DELIVERY sem nenhum OTP ativo.
      otpCode = await otpService.generateInTx(orderId, distributorUserId, tx);

      return updated;
    });

    // Só cacheia o código em claro no Redis depois que a transação acima
    // comitou — evita expor um OTP cujo registro em Postgres foi revertido.
    await otpService.cacheCode(orderId, otpCode);

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.OUT_FOR_DELIVERY, { driverId });

    // Notifica driver
    orderEventsPublisher.notifyDriver(driverId, "new_delivery", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

    notificationService
      .send(order.consumer_id, "Pedido saiu para entrega!", "Acompanhe seu pedido em tempo real.")
      .catch(() => {});

    return { order, otpCode };
  },

  /**
   * Checklist + Dispatch atômico: ACCEPTED_BY_DISTRIBUTOR → READY_FOR_DISPATCH → OUT_FOR_DELIVERY
   * Faz as duas transições em uma única transação para evitar estado inconsistente.
   */
  async dispatchWithChecklist(
    orderId: string,
    distributorUserId: string,
    driverId: string
  ): Promise<{ order: Order; otpCode: string }> {
    const distributorId = await resolveDistributorIdForUser(distributorUserId);
    await assertDriverBelongsToDistributor(distributorId, driverId);

    const prisma = getPrisma();
    let otpCode = "";
    const order = await prisma.$transaction(async (tx: TxClient) => {
      const current = await orderRepository.findById(orderId, tx);
      if (!current) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
      if (current.distributor_id !== distributorId) {
        throw new OrderServiceError("FORBIDDEN", "Acesso negado");
      }
      if (current.status !== OrderStatus.ACCEPTED_BY_DISTRIBUTOR) {
        throw new OrderServiceError("INVALID_STATUS", "Pedido precisa estar aceito para concluir checklist e despacho");
      }

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

      if (current.driver_id !== driverId) {
        await auditRepository.emit(
          {
            eventType: AuditEventType.ORDER_DRIVER_ASSIGNED,
            actor: { type: ActorType.DISTRIBUTOR_USER, id: distributorUserId },
            orderId,
            sourceApp: SourceApp.DISTRIBUTOR_WEB,
            payload: { action: "dispatch_with_checklist", driverId, previous_driver_id: current.driver_id },
          },
          tx
        );
      }

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

      // OTP é gerado na mesma transação do dispatch: se o commit falhar, o
      // pedido não fica OUT_FOR_DELIVERY sem nenhum OTP ativo.
      otpCode = await otpService.generateInTx(orderId, distributorUserId, tx);

      return updated;
    });

    // Só cacheia o código em claro no Redis depois que a transação acima
    // comitou — evita expor um OTP cujo registro em Postgres foi revertido.
    await otpService.cacheCode(orderId, otpCode);

    orderEventsPublisher.notifyConsumer(order.consumer_id, "order_status_changed", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });
    orderEventsPublisher.distributorOrderStatusChanged(order, OrderStatus.OUT_FOR_DELIVERY, { driverId });

    orderEventsPublisher.notifyDriver(driverId, "new_delivery", {
      orderId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

    notificationService
      .send(order.consumer_id, "Pedido saiu para entrega!", "Acompanhe seu pedido em tempo real.")
      .catch(() => {});

    return { order, otpCode };
  },
};
