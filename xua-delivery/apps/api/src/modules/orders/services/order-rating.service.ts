import type { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { ActorType, AuditEventType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderRepository } from "../repository/orders.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { OrderServiceError } from "../errors.js";

type TxClient = Prisma.TransactionClient;

/**
 * orderRatingService — avaliação NPS do pedido pelo consumidor.
 */
export const orderRatingService = {
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
      if (current.nps_score != null) {
        throw new OrderServiceError("ALREADY_RATED", "Pedido já foi avaliado");
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
};
