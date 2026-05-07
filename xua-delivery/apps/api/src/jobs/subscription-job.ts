import { SubscriptionStatus } from "@prisma/client";
import { getPrisma } from "../infra/prisma/client.js";
import { orderService } from "../modules/orders/services/orders.service.js";
import { productsRepository } from "../modules/products/repository/products.repository.js";
import { logger } from "../infra/logger/index.js";
import { nextWeekdayDate } from "../utils/date.js";

const BATCH_SIZE = 50;

/**
 * Job handler: gera pedidos automáticos das assinaturas semanais ativas.
 * Chamado via HTTP POST pelo Render Cron Job (06h São Paulo).
 *
 * Para cada Subscription com:
 *   - status = ACTIVE
 *   - hoje (UTC weekday) ∈ weekdays[]
 *   - next_delivery_date <= hoje
 *   - time_slot_id, address_id, distributor_id, zone_id preenchidos
 * cria um Order completo via orderService.createOrder (que valida agenda,
 * reserva capacidade, gera items, calcula total e emite audit), liga via
 * SubscriptionOrder e avança next_delivery_date para o próximo weekday.
 *
 * Idempotente por dia: se já existe SubscriptionOrder para a sub no dia,
 * apenas avança next_delivery_date e segue.
 */
export async function runSubscriptionJob(): Promise<{
  processed: number;
  created: number;
  skipped: number;
  failed: number;
}> {
  const prisma = getPrisma();
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const todayStr = todayUtc.toISOString().split("T")[0];
  const todayWeekday = todayUtc.getUTCDay();

  const products = await productsRepository.findActive();
  const defaultProduct = products[0];
  if (!defaultProduct) {
    logger.warn("subscription-job: nenhum produto ativo cadastrado, abortando");
    return { processed: 0, created: 0, skipped: 0, failed: 0 };
  }

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        weekdays: { has: todayWeekday },
        OR: [
          { next_delivery_date: null },
          { next_delivery_date: { lte: todayUtc } },
        ],
        time_slot_id: { not: null },
        address_id: { not: null },
        distributor_id: { not: null },
        zone_id: { not: null },
      },
      include: { time_slot: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    for (const sub of batch) {
      processed++;
      const slot = sub.time_slot;
      if (!slot) {
        skipped++;
        continue;
      }

      try {
        const existing = await prisma.subscriptionOrder.findFirst({
          where: {
            subscription_id: sub.id,
            order: { delivery_date: todayUtc },
          },
        });

        if (!existing) {
          const product = sub.product_id
            ? (await prisma.product.findUnique({ where: { id: sub.product_id } })) ??
              defaultProduct
            : defaultProduct;
          const quantity = sub.qty_20l ?? sub.quantity ?? 1;

          const order = await orderService.createOrder({
            consumerId: sub.consumer_id,
            addressId: sub.address_id!,
            distributorId: sub.distributor_id!,
            zoneId: sub.zone_id!,
            deliveryDate: todayStr,
            deliveryWindow: slot.window,
            distributorSelectionMode: "auto",
            timeSlotId: sub.time_slot_id,
            items: [
              {
                product_id: product.id,
                product_name: product.name,
                unit_price_cents: product.price_cents,
                quantity,
              },
            ],
          });

          await prisma.subscriptionOrder.create({
            data: { subscription_id: sub.id, order_id: order.id },
          });
          created++;
        }

        const nextDate = nextWeekdayDate(sub.weekdays, todayUtc, false);
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { next_delivery_date: new Date(nextDate + "T00:00:00.000Z") },
        });
      } catch (err) {
        failed++;
        logger.warn(
          { err, subscriptionId: sub.id },
          "subscription-job: falha ao gerar order, avançando next_delivery_date",
        );
        try {
          const nextDate = nextWeekdayDate(sub.weekdays, todayUtc, false);
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { next_delivery_date: new Date(nextDate + "T00:00:00.000Z") },
          });
        } catch (innerErr) {
          logger.error(
            { err: innerErr, subscriptionId: sub.id },
            "subscription-job: falha ao avançar next_delivery_date",
          );
        }
      }
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  const legacySkipped = await prisma.subscription.count({
    where: {
      status: SubscriptionStatus.ACTIVE,
      weekdays: { has: todayWeekday },
      time_slot_id: null,
    },
  });

  logger.info(
    { processed, created, skipped, failed, legacySkipped },
    "subscription-job: assinaturas processadas",
  );

  return { processed, created, skipped, failed };
}
