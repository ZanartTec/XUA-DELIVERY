import type { Order } from "@prisma/client";
import type { OrderStatus } from "@xua/shared/enums";
import {
  RealtimeEvent,
  type RealtimeEventName,
  type RealtimePayloads,
} from "@xua/shared/realtime/events";
import { realtimePublisher } from "../../../infra/realtime/publisher.js";
import { rooms } from "../../../infra/realtime/rooms.js";

/**
 * Fachada de eventos de pedido. Sempre chamada depois do commit; o transporte
 * (Socket.IO na API, redis-emitter no worker) é escolhido na inicialização do
 * processo, então o mesmo serviço funciona nos dois lugares.
 */
export const orderEventsPublisher = {
  notifyConsumer<E extends RealtimeEventName>(
    consumerId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void {
    realtimePublisher.publish(rooms.consumer(consumerId), event, payload);
  },

  notifyDistributor<E extends RealtimeEventName>(
    distributorId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void {
    realtimePublisher.publish(rooms.distributor(distributorId), event, payload);
  },

  notifyDriver<E extends RealtimeEventName>(
    driverId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void {
    realtimePublisher.publish(rooms.driver(driverId), event, payload);
  },

  /**
   * Notifica ops/suporte. Reservado a eventos que exigem ação humana — uma
   * sala global recebe o tráfego de todas as distribuidoras, então espelhar
   * tudo aqui vira ruído e custo à toa.
   */
  notifyOps<E extends RealtimeEventName>(event: E, payload: RealtimePayloads[E]): void {
    realtimePublisher.publish(rooms.ops(), event, payload);
  },

  /** Notifica a sala da distribuidora sobre mudança de status de um pedido. */
  distributorOrderStatusChanged(
    order: Order,
    status: OrderStatus,
    payload: Record<string, unknown> = {}
  ): void {
    orderEventsPublisher.notifyDistributor(order.distributor_id, RealtimeEvent.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      status,
      driverId: order.driver_id ?? null,
      ...payload,
    });
  },
};
