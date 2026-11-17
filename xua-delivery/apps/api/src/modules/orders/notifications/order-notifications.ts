import { OrderStatus } from "@xua/shared/enums";
import type { NewOrderPayload } from "@xua/shared/realtime/events";
import {
  pushDispatcher,
  type PushIntent,
} from "../../notifications/services/push-dispatcher.js";

/**
 * Regras de push (Web Push) por transição de pedido — o único lugar que decide
 * quem recebe notificação do sistema e com qual texto (T2.6). Os serviços só
 * chamam `orderNotifications.onTransition` depois do commit.
 *
 * Socket ≠ push: o socket atualiza telas abertas; o push avisa quem está com o
 * app fechado, então só sai quando a pessoa precisa saber ou agir.
 */

export type TransitionActor = "consumer" | "ops" | "distributor" | "driver" | "system";

/** Campos do pedido que as regras usam (o `Order` do Prisma satisfaz). */
export interface TransitionOrder {
  id: string;
  consumer_id: string;
  distributor_id: string;
  driver_id: string | null;
  delivery_date?: Date | null;
}

export interface TransitionContext {
  actor?: TransitionActor;
  /** Só em `SENT_TO_DISTRIBUTOR`: dados do pedido novo para o texto e para D6. */
  newOrder?: NewOrderPayload;
  /** Motorista que vai sair com o pedido (despacho). */
  driverId?: string;
}

/**
 * Status em que o pedido já está "na mão" da distribuidora: um cancelamento
 * nesses pontos precisa chegar até ela (socket e push). Antes de
 * `SENT_TO_DISTRIBUTOR` ela nem sabe que o pedido existe.
 */
export const DISTRIBUTOR_AWARE_STATUSES: ReadonlySet<string> = new Set([
  OrderStatus.SENT_TO_DISTRIBUTOR,
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERY_FAILED,
  OrderStatus.REDELIVERY_SCHEDULED,
]);

const HOUR = 60 * 60;

function shortId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const iso = typeof date === "string" ? date : date.toISOString();
  const [, month, day] = iso.slice(0, 10).split("-");
  return day && month ? `${day}/${month}` : null;
}

function consumerIntent(
  order: TransitionOrder,
  status: string,
  title: string,
  body: string
): PushIntent {
  return {
    target: { kind: "user", id: order.consumer_id },
    title,
    body,
    url: `/orders/${order.id}`,
    tag: `order-${order.id}`,
    urgency: "normal",
    ttlSeconds: 6 * HOUR,
    dedupeKey: `${status}:${order.id}:consumer`,
    kind: "order_status",
  };
}

function newOrderBody(details: NewOrderPayload | undefined): string {
  const parts: string[] = [];
  if (details?.customerFirstName) parts.push(details.customerFirstName);
  if (details?.itemsCount) {
    parts.push(`${details.itemsCount} ${details.itemsCount === 1 ? "item" : "itens"}`);
  }
  if (typeof details?.totalCents === "number" && details.totalCents > 0) {
    parts.push(formatCents(details.totalCents));
  }
  return parts.length > 0 ? parts.join(" · ") : "Toque para ver o pedido.";
}

/** Função pura: quais pushes uma transição gera. */
export function pushIntentsForTransition(
  order: TransitionOrder,
  from: string | null,
  to: string,
  ctx: TransitionContext = {}
): PushIntent[] {
  const intents: PushIntent[] = [];
  const actor = ctx.actor ?? "system";

  switch (to) {
    case OrderStatus.SENT_TO_DISTRIBUTOR: {
      // D6: pedido de assinatura não gera push individual (vai no resumo).
      if (ctx.newOrder?.origin === "assinatura") break;
      intents.push({
        target: { kind: "distributor", id: order.distributor_id },
        title: "Novo pedido",
        body: newOrderBody(ctx.newOrder),
        url: `/distributor/orders/${order.id}`,
        tag: `order-${order.id}`,
        urgency: "high",
        ttlSeconds: 1 * HOUR,
        dedupeKey: `new_order:${order.id}`,
        kind: "new_order",
      });
      break;
    }

    case OrderStatus.ACCEPTED_BY_DISTRIBUTOR:
      intents.push(
        consumerIntent(order, to, "Pedido aceito", "A distribuidora aceitou seu pedido e já vai prepará-lo.")
      );
      break;

    case OrderStatus.REJECTED_BY_DISTRIBUTOR:
      intents.push(
        consumerIntent(
          order,
          to,
          "Pedido recusado",
          "A distribuidora não conseguiu atender seu pedido. Toque para ver os detalhes."
        )
      );
      break;

    case OrderStatus.OUT_FOR_DELIVERY: {
      intents.push(
        consumerIntent(order, to, "Pedido saiu para entrega!", "Acompanhe seu pedido em tempo real.")
      );
      const driverId = ctx.driverId ?? order.driver_id;
      if (driverId) {
        intents.push({
          target: { kind: "user", id: driverId },
          title: "Nova entrega",
          body: `Pedido #${shortId(order.id)} está com você.`,
          url: `/driver/deliveries/${order.id}`,
          tag: `order-${order.id}`,
          urgency: "high",
          ttlSeconds: 2 * HOUR,
          dedupeKey: `${to}:${order.id}:driver:${driverId}`,
          kind: "new_delivery",
        });
      }
      break;
    }

    case OrderStatus.DELIVERED:
      intents.push(
        consumerIntent(order, to, "Pedido entregue!", "Seu pedido foi entregue com sucesso.")
      );
      break;

    case OrderStatus.DELIVERY_FAILED:
      intents.push(
        consumerIntent(
          order,
          to,
          "Não conseguimos entregar",
          "Tivemos um problema na entrega. Vamos reagendar e te avisar."
        )
      );
      break;

    case OrderStatus.REDELIVERY_SCHEDULED: {
      const date = formatDate(order.delivery_date);
      intents.push(
        consumerIntent(
          order,
          to,
          "Reentrega agendada",
          date ? `Nova data de entrega: ${date}.` : "Sua entrega foi reagendada."
        )
      );
      break;
    }

    case OrderStatus.CANCELLED: {
      const label = `Pedido #${shortId(order.id)}`;
      if (actor !== "consumer") {
        intents.push(
          consumerIntent(order, to, "Pedido cancelado", `${label} foi cancelado. Toque para ver os detalhes.`)
        );
      }
      if (from && DISTRIBUTOR_AWARE_STATUSES.has(from) && actor !== "distributor") {
        intents.push({
          target: { kind: "distributor", id: order.distributor_id },
          title: "Pedido cancelado",
          body: `${label} foi cancelado${actor === "consumer" ? " pelo cliente" : ""}.`,
          url: `/distributor/orders/${order.id}`,
          tag: `order-${order.id}`,
          urgency: "high",
          ttlSeconds: 2 * HOUR,
          dedupeKey: `${to}:${order.id}:distributor`,
          kind: "order_cancelled",
        });
      }
      if (from === OrderStatus.OUT_FOR_DELIVERY && order.driver_id && actor !== "driver") {
        intents.push({
          target: { kind: "user", id: order.driver_id },
          title: "Entrega cancelada",
          body: `${label} foi cancelado. Não entregue.`,
          url: `/driver/deliveries`,
          tag: `order-${order.id}`,
          urgency: "high",
          ttlSeconds: 2 * HOUR,
          dedupeKey: `${to}:${order.id}:driver`,
          kind: "order_cancelled",
        });
      }
      break;
    }

    default:
      break;
  }

  return intents;
}

/** Push-resumo da geração de assinaturas (D6): 1 por distribuidora, sem som. */
export function subscriptionSummaryIntent(
  distributorId: string,
  count: number,
  runKey: string
): PushIntent {
  return {
    target: { kind: "distributor", id: distributorId },
    title: "Pedidos de assinatura",
    body:
      count === 1
        ? "1 pedido de assinatura foi gerado e está na fila."
        : `${count} pedidos de assinatura foram gerados e estão na fila.`,
    url: "/distributor/queue",
    tag: `subscription-summary-${distributorId}`,
    urgency: "normal",
    ttlSeconds: 12 * HOUR,
    dedupeKey: `subscription_summary:${distributorId}:${runKey}`,
    kind: "subscription_summary",
    silent: true,
  };
}

export const orderNotifications = {
  /** Chamado depois do commit. Nunca lança. */
  async onTransition(
    order: TransitionOrder,
    from: string | null,
    to: string,
    ctx: TransitionContext = {}
  ): Promise<void> {
    await pushDispatcher.enqueueAll(pushIntentsForTransition(order, from, to, ctx));
  },

  async onSubscriptionBatch(countsByDistributor: ReadonlyMap<string, number>, runKey: string): Promise<void> {
    const intents: PushIntent[] = [];
    for (const [distributorId, count] of countsByDistributor) {
      if (count > 0) intents.push(subscriptionSummaryIntent(distributorId, count, runKey));
    }
    await pushDispatcher.enqueueAll(intents);
  },
};
