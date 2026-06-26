import { DeliveryDateStatus } from "@xua/shared/enums";
import type { OrderForQueue } from "../repository/orders.repository.js";

type NewSubscriptionDeliveryContext = NonNullable<OrderForQueue["subscription_delivery_date"]>;

export type DistributorOrderOriginContext = {
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

/**
 * Deriva o contexto de origem do pedido (carrinho vs. assinatura) e, quando
 * for assinatura, a posição da entrega na série (sequência, total, restantes).
 */
export function buildDistributorOrderOriginContext(order: {
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
