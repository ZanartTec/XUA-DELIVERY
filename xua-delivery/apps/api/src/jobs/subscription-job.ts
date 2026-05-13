import { UserSubscriptionStatus, DeliveryDateStatus } from "@prisma/client";
import { getPrisma } from "../infra/prisma/client.js";
import { orderService } from "../modules/orders/services/orders.service.js";
import { userSubscriptionsRepository } from "../modules/user-subscriptions/repository/user-subscriptions.repository.js";
import { logger } from "../infra/logger/index.js";

/**
 * Job handler: gera pedidos automáticos das entregas agendadas do modelo novo.
 * Chamado via HTTP POST pelo Render Cron Job (06h São Paulo).
 */
export async function runSubscriptionJob(): Promise<{
  processed: number;
  created: number;
  failed: number;
}> {
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const todayStr = todayUtc.toISOString().split("T")[0];

  const result = await processNewSubscriptionDeliveries(todayUtc, todayStr);
  logger.info(result, "subscription-job: entregas do modelo novo processadas");

  return result;
}

/**
 * Processa entregas agendadas do novo modelo de assinaturas (UserSubscription).
 * Cria pedidos para cada SubscriptionDeliveryDate com status PENDING,
 * delivery_date = hoje, e userSubscription.status = ACTIVE.
 */
async function processNewSubscriptionDeliveries(
  todayUtc: Date,
  todayStr: string
): Promise<{ processed: number; created: number; failed: number }> {
  const prisma = getPrisma();
  let processed = 0;
  let created = 0;
  let failed = 0;

  const pending = await userSubscriptionsRepository.findPendingDeliveriesToday(todayUtc);

  for (const deliveryDate of pending) {
    processed++;
    const { user_subscription: sub, time_slot: slot } = deliveryDate;

    if (!sub || !slot) {
      failed++;
      continue;
    }

    const address = sub.address;
    const product = sub.plan.product;

    if (!address?.zone_id) {
      logger.warn(
        { deliveryDateId: deliveryDate.id },
        "subscription-job: endereço sem zone_id, pulando"
      );
      failed++;
      continue;
    }

    try {
      const order = await orderService.createOrder({
        consumerId: sub.consumer_id,
        addressId: sub.address_id,
        distributorId: sub.distributor_id,
        zoneId: address.zone_id,
        deliveryDate: todayStr,
        deliveryWindow: slot.window,
        distributorSelectionMode: "auto",
        timeSlotId: slot.id,
        items: [
          {
            product_id: product.id,
            product_name: product.name,
            unit_price_cents: 0, // já pago na assinatura
            quantity: deliveryDate.quantity_for_this_delivery,
          },
        ],
      });

      await prisma.$transaction(async (tx) => {
        await tx.subscriptionDeliveryDate.update({
          where: { id: deliveryDate.id },
          data: {
            status: DeliveryDateStatus.DELIVERED,
            order_id: order.id,
          },
        });

        const updated = await tx.userSubscription.update({
          where: { id: sub.id },
          data: { remaining_quantity: { decrement: deliveryDate.quantity_for_this_delivery } },
        });

        if (updated.remaining_quantity <= 0) {
          await tx.userSubscription.update({
            where: { id: sub.id },
            data: { status: UserSubscriptionStatus.COMPLETED },
          });
        }
      });

      created++;
    } catch (err) {
      failed++;
      logger.warn(
        { err, deliveryDateId: deliveryDate.id, subscriptionId: sub.id },
        "subscription-job: falha ao criar order para entrega agendada"
      );
    }
  }

  return { processed, created, failed };
}
