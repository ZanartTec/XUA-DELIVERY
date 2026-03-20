import db from "@/src/lib/db";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";
import { TABLES } from "@/src/lib/tables";

// FUNC-02: Calcula próxima data evitando overflow de dia (31→28 etc.)
function nextMonthSameDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const targetMonth = d.getUTCMonth() + 1;
  const targetYear = targetMonth > 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const normalizedMonth = targetMonth > 11 ? 0 : targetMonth;
  // Usa dia 0 do mês seguinte pra descobrir último dia do mês alvo
  const lastDayOfTarget = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTarget);
  const result = new Date(Date.UTC(targetYear, normalizedMonth, day));
  return result.toISOString().split("T")[0];
}

const BATCH_SIZE = 50;

/**
 * Cron job: gera pedidos automáticos das assinaturas ativas.
 * Executado diariamente às 06h (America/Sao_Paulo) via node-cron no server.ts.
 * PERF-02: Processamento em lotes de 50 para evitar uso excessivo de memória.
 */
export async function subscriptionCron(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  let processedCount = 0;

  try {
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await db(TABLES.SUBSCRIPTIONS)
        .where({ status: "active", next_delivery_date: today })
        .limit(BATCH_SIZE)
        .offset(offset);

      if (batch.length === 0) break;

      for (const sub of batch) {
        await db.transaction(async (trx) => {
          const [order] = await trx(TABLES.ORDERS)
            .insert({
              consumer_id: sub.consumer_id,
              address_id: sub.address_id,
              distributor_id: sub.distributor_id || null,
              zone_id: sub.zone_id || null,
              status: "CREATED",
              delivery_date: today,
              delivery_window: sub.delivery_window,
              subtotal_cents: 0,
              delivery_fee_cents: 0,
              deposit_cents: 0,
              total_cents: 0,
              collected_empty_qty: 0,
            })
            .returning("*");

          await trx(TABLES.SUBSCRIPTION_ORDERS).insert({
            subscription_id: sub.id,
            order_id: order.id,
          });

          // FUNC-02: Usa função segura para data do próximo mês
          const nextDate = nextMonthSameDay(today);
          await trx(TABLES.SUBSCRIPTIONS)
            .where({ id: sub.id })
            .update({
              next_delivery_date: nextDate,
              updated_at: new Date(),
            });

          await auditRepository.emit(
            {
              eventType: AuditEventType.ORDER_CREATED,
              actor: { type: ActorType.SYSTEM, id: "subscription-cron" },
              orderId: order.id,
              sourceApp: SourceApp.BACKEND,
              payload: { subscription_id: sub.id, auto_generated: true },
            },
            trx
          );
        });
      }

      processedCount += batch.length;
      offset += BATCH_SIZE;
    }

    console.log(
      `[subscription-cron] ${processedCount} assinaturas processadas`
    );
  } catch (error) {
    console.error("[subscription-cron] Erro:", error);
  }
}
