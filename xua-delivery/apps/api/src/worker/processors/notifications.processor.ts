import type { Job } from "bullmq";
import type { PushNotificationJobPayload } from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { notificationService } from "../../modules/notifications/services/notification.service.js";

const log = createLogger("notifications-worker");

export type PushJobResult =
  | { action: "skipped"; reason: "vapid_not_configured" | "no_recipients" }
  | { action: "sent"; recipients: number; sent: number; failed: number; removed: number };

/**
 * Envia um push enfileirado (T5.4).
 *
 * - `distributor` vira os admins ATIVOS daquela distribuidora.
 * - Sem VAPID: conclui sem erro (feature desligada; retry não resolveria).
 * - Só relança (para o BullMQ tentar de novo) quando nada foi entregue e houve
 *   falha temporária (5xx, 429, rede). Se algum navegador já recebeu, uma
 *   nova tentativa duplicaria a notificação nele.
 */
export async function processPushNotification(job: Job<PushNotificationJobPayload>): Promise<PushJobResult> {
  const { intent, correlationId } = job.data;

  if (!notificationService.isConfigured()) {
    log.warn({ jobId: job.id, kind: intent.kind }, "VAPID não configurado: push descartado");
    return { action: "skipped", reason: "vapid_not_configured" };
  }

  const recipients =
    intent.target.kind === "distributor"
      ? await notificationService.resolveDistributorRecipients(intent.target.id)
      : [intent.target.id];

  if (recipients.length === 0) {
    return { action: "skipped", reason: "no_recipients" };
  }

  const result = await notificationService.sendToUsers(
    recipients,
    {
      title: intent.title,
      body: intent.body,
      url: intent.url,
      tag: intent.tag,
      kind: intent.kind,
      silent: intent.silent ?? false,
    },
    { ttlSeconds: intent.ttlSeconds, urgency: intent.urgency }
  );

  log.info(
    { jobId: job.id, correlationId, kind: intent.kind, recipients: recipients.length, ...result },
    "Push job processed"
  );

  if (result.sent === 0 && result.retryable > 0) {
    throw new Error(`PUSH_TEMPORARY_FAILURE:${intent.dedupeKey}`);
  }

  return { action: "sent", recipients: recipients.length, ...result };
}
