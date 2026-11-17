import { UserSubscriptionStatus } from "@xua/shared/enums";
import { getPrisma } from "../infra/prisma/client.js";
import { enqueuePushNotification } from "../infra/queue/notifications.producer.js";
import { logger } from "../infra/logger/index.js";

// Notifica quando remaining_quantity <= LOW_BALANCE_THRESHOLD
const LOW_BALANCE_THRESHOLD = 3;

/**
 * Job handler: verifica assinaturas com saldo baixo e envia notificação push.
 * Chamado via HTTP POST pelo Render Cron Job.
 * Idempotente: só notifica se low_balance_notification_sent_at for null.
 */
export async function runSubscriptionExpiryJob(): Promise<{
  checked: number;
  notified: number;
  failed: number;
}> {
  const prisma = getPrisma();
  let checked = 0;
  let notified = 0;
  let failed = 0;

  const lowBalanceSubs = await prisma.userSubscription.findMany({
    where: {
      status: UserSubscriptionStatus.ACTIVE,
      remaining_quantity: { lte: LOW_BALANCE_THRESHOLD, gt: 0 },
      low_balance_notification_sent_at: null,
    },
  });

  for (const sub of lowBalanceSubs) {
    checked++;
    try {
      // Enfileira direto (não via pushDispatcher, que engole erro): se a fila
      // falhar, a marcação abaixo não acontece e o próximo ciclo tenta de novo.
      await enqueuePushNotification(
        {
          target: { kind: "user", id: sub.consumer_id },
          title: "Sua assinatura está acabando",
          body: `Restam apenas ${sub.remaining_quantity} entrega(s) na sua assinatura. Renove em breve!`,
          url: "/subscription/manage",
          tag: `subscription-${sub.id}`,
          urgency: "normal",
          ttlSeconds: 24 * 60 * 60,
          dedupeKey: `subscription_low_balance:${sub.id}`,
          kind: "subscription_low_balance",
        },
        "worker"
      );

      await prisma.userSubscription.update({
        where: { id: sub.id },
        data: { low_balance_notification_sent_at: new Date() },
      });

      notified++;
      logger.info({ subscriptionId: sub.id, remaining: sub.remaining_quantity }, "Low balance notification sent");
    } catch (err) {
      failed++;
      logger.warn({ err, subscriptionId: sub.id }, "subscription-expiry-job: falha ao notificar");
    }
  }

  return { checked, notified, failed };
}
