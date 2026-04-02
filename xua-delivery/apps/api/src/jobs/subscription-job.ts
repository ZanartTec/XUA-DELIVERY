import {
  SubscriptionStatus,
  OrderStatus,
  DeliveryWindow,
  AuditEventType,
  ActorType,
  SourceApp,
} from "@prisma/client";
import { getPrisma } from "../infra/prisma/client.js";
import { auditRepository } from "../modules/audit/audit.repository.js";
import { logger } from "../infra/logger/index.js";

// FUNC-02: Calcula próxima data evitando overflow de dia (31→28 etc.)
function nextMonthSameDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const targetMonth = d.getUTCMonth() + 1;
  const targetYear =
    targetMonth > 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const normalizedMonth = targetMonth > 11 ? 0 : targetMonth;
  const lastDayOfTarget = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0)
  ).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTarget);
  const result = new Date(Date.UTC(targetYear, normalizedMonth, day));
  return result.toISOString().split("T")[0];
}

const BATCH_SIZE = 50;

/**
 * Job handler: gera pedidos automáticos das assinaturas ativas.
 * Chamado via HTTP POST pelo Render Cron Job (06h São Paulo).
 * PERF-02: Processamento em lotes de 50.
 */
export async function runSubscriptionJob(): Promise<{ processed: number }> {
  const prisma = getPrisma();
  const today = new Date().toISOString().split("T")[0];
  const todayDate = new Date(today + "T00:00:00Z");
  let processedCount = 0;

  let skip = 0;
  while (true) {
    const batch = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        next_delivery_date: todayDate,
      },
      take: BATCH_SIZE,
      skip,
    });

    if (batch.length === 0) break;

    for (const sub of batch) {
      if (!sub.address_id || !sub.distributor_id || !sub.zone_id) continue;

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            consumer_id: sub.consumer_id,
            address_id: sub.address_id!,
            distributor_id: sub.distributor_id!,
            zone_id: sub.zone_id!,
            status: OrderStatus.CREATED,
            delivery_date: todayDate,
            delivery_window: sub.delivery_window ?? DeliveryWindow.MORNING,
            subtotal_cents: 0,
            delivery_fee_cents: 0,
            deposit_cents: 0,
            total_cents: 0,
            collected_empty_qty: 0,
          },
        });

        await tx.subscriptionOrder.create({
          data: {
            subscription_id: sub.id,
            order_id: order.id,
          },
        });

        // FUNC-02: Usa função segura para data do próximo mês
        const nextDate = nextMonthSameDay(today);
        await tx.subscription.update({
          where: { id: sub.id },
          data: { next_delivery_date: new Date(nextDate + "T00:00:00Z") },
        });

        await auditRepository.emit(
          {
            eventType: AuditEventType.ORDER_CREATED,
            actor: { type: ActorType.SYSTEM, id: "subscription-cron" },
            orderId: order.id,
            sourceApp: SourceApp.BACKEND,
            payload: { subscription_id: sub.id, auto_generated: true },
          },
          tx
        );
      });
    }

    processedCount += batch.length;
    skip += BATCH_SIZE;
  }

  logger.info(
    { processed: processedCount },
    "subscription-job: assinaturas processadas"
  );

  return { processed: processedCount };
}
