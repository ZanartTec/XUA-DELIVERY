import type { Prisma } from "@prisma/client";
import { DeliveryDateStatus, UserSubscriptionStatus } from "@xua/shared/enums";
import { notificationService } from "../../notifications/services/notification.service.js";
import { createLogger } from "../../../infra/logger/index.js";

type TxClient = Prisma.TransactionClient;

const log = createLogger("subscription-settlement");

/** Teto de tentativas de geração antes de marcar a entrega como FAILED (D13). */
export const MAX_GENERATION_ATTEMPTS = 3;

export interface PersistentFailureNotice {
  consumerId: string;
  subscriptionId: string;
  deliveryDateId: string;
  remainingQuantity: number;
}

/**
 * subscriptionSettlementService — reflete o resultado terminal de um pedido de
 * assinatura de volta na entrega/assinatura (compensação — D7/D13).
 *
 * Todas as operações são feitas dentro da transação do chamador (serviço de
 * pedido), garantindo atomicidade com a mudança de status do pedido. Não importa
 * `orderService` (evita ciclo entre módulos). É no-op para pedidos que não têm
 * entrega de assinatura vinculada.
 */
export const subscriptionSettlementService = {
  /**
   * Pedido entregue → entrega DELIVERED (terminal de sucesso). O saldo já foi
   * debitado na geração; nada a recreditar.
   */
  async settleDelivered(tx: TxClient, orderId: string): Promise<void> {
    const delivery = await tx.subscriptionDeliveryDate.findUnique({
      where: { order_id: orderId },
      select: { id: true, status: true },
    });
    if (!delivery || delivery.status !== DeliveryDateStatus.ORDER_CREATED) return;

    await tx.subscriptionDeliveryDate.update({
      where: { id: delivery.id },
      data: { status: DeliveryDateStatus.DELIVERED },
    });
  },

  /**
   * Pedido falhou de forma terminal (rejeitado/cancelado) → recredita o saldo e
   * torna a entrega re-elegível (PENDING). Após o teto de tentativas, marca
   * FAILED (não re-elegível) e retorna um aviso para notificação pós-commit.
   * Retorna null quando não há falha persistente (ou não é pedido de assinatura).
   */
  async settleFailed(tx: TxClient, orderId: string): Promise<PersistentFailureNotice | null> {
    const delivery = await tx.subscriptionDeliveryDate.findUnique({
      where: { order_id: orderId },
      include: { user_subscription: true },
    });
    if (!delivery || delivery.status !== DeliveryDateStatus.ORDER_CREATED) return null;

    const sub = delivery.user_subscription;
    const persistent = delivery.generation_attempts >= MAX_GENERATION_ATTEMPTS;

    // Desvincula o pedido e recoloca a entrega no fluxo (ou a encerra em FAILED).
    await tx.subscriptionDeliveryDate.update({
      where: { id: delivery.id },
      data: {
        status: persistent ? DeliveryDateStatus.FAILED : DeliveryDateStatus.PENDING,
        order_id: null,
      },
    });

    // Recredita o saldo da entrega que falhou. Se a assinatura havia sido
    // concluída, volta a ACTIVE (há entrega a tratar novamente).
    const updatedSub = await tx.userSubscription.update({
      where: { id: sub.id },
      data: {
        remaining_quantity: { increment: delivery.quantity_for_this_delivery },
        ...(sub.status === UserSubscriptionStatus.COMPLETED
          ? { status: UserSubscriptionStatus.ACTIVE }
          : {}),
      },
    });

    if (!persistent) return null;

    return {
      consumerId: sub.consumer_id,
      subscriptionId: sub.id,
      deliveryDateId: delivery.id,
      remainingQuantity: updatedSub.remaining_quantity,
    };
  },

  /**
   * Notifica a falha persistente (pós-commit, fire-and-forget): push ao consumidor
   * e log estruturado para a Operação acompanhar/resolver (Fase 3). Não há canal de
   * push dedicado para ops; o log de erro serve de alerta e o saldo recreditado
   * permanece disponível até a reprocessagem manual.
   */
  async notifyPersistentFailure(notice: PersistentFailureNotice): Promise<void> {
    log.error(
      {
        subscriptionId: notice.subscriptionId,
        deliveryDateId: notice.deliveryDateId,
        consumerId: notice.consumerId,
      },
      "subscription-settlement: entrega marcada como FAILED após 3 tentativas — requer ação da Operação"
    );

    await notificationService
      .send(
        notice.consumerId,
        "Não conseguimos concluir uma entrega da sua assinatura",
        "Tivemos um problema ao processar uma entrega. Nossa equipe já foi avisada e o saldo segue disponível.",
        { type: "subscription_delivery_failed", subscription_id: notice.subscriptionId }
      )
      .catch(() => undefined);
  },
};
