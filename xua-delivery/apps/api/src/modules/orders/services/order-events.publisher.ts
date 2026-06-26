import type { Order } from "@prisma/client";
import type { OrderStatus } from "@xua/shared/enums";
import { getIO } from "../../../infra/socket/gateway.js";
import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("order-events");

/**
 * Emite um evento de socket sem deixar uma falha do Socket.IO (ex.: servidor
 * ainda não inicializado) virar 500 numa requisição cuja transação já comitou.
 */
function safeEmit(room: string, event: string, payload: Record<string, unknown>): void {
  try {
    getIO().to(room).emit(event, payload);
  } catch (error) {
    log.warn({ error, room, event }, "Failed to emit socket event");
  }
}

export const orderEventsPublisher = {
  notifyConsumer(consumerId: string, event: string, payload: Record<string, unknown>): void {
    safeEmit(`consumer:${consumerId}`, event, payload);
  },

  notifyDistributor(distributorId: string, event: string, payload: Record<string, unknown>): void {
    safeEmit(`distributor:${distributorId}`, event, payload);
  },

  notifyDriver(driverId: string, event: string, payload: Record<string, unknown>): void {
    safeEmit(`driver:${driverId}`, event, payload);
  },

  /** Notifica a sala da distribuidora sobre mudança de status de um pedido. */
  distributorOrderStatusChanged(
    order: Order,
    status: OrderStatus,
    payload: Record<string, unknown> = {}
  ): void {
    orderEventsPublisher.notifyDistributor(order.distributor_id, "order_status_changed", {
      orderId: order.id,
      status,
      driverId: order.driver_id ?? null,
      ...payload,
    });
  },
};
