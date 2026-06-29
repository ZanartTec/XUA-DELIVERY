import type { Job } from "bullmq";
import {
  ActorType,
  AuditEventType,
  PaymentKind,
  PaymentStatus,
  SourceApp,
  UserSubscriptionStatus,
} from "@xua/shared/enums";
import type { SubscriptionExpirationJobPayload } from "../../infra/queue/contracts";
import { createLogger } from "../../infra/logger";
import { getPrisma } from "../../infra/prisma/client";
import { auditRepository } from "../../modules/audit/audit.repository.js";

const log = createLogger("expire-subscription-worker");

const PENDING_PAYMENT_STATUSES = new Set<string>([
  PaymentStatus.CREATED,
  PaymentStatus.AUTHORIZED,
]);

type ExpirationResult =
  | { action: "skipped"; reason: string; status?: string }
  | { action: "expired"; subscriptionId: string; paymentId: string | null };

/**
 * Expira uma assinatura `PENDING_PAYMENT` não paga dentro do prazo.
 *
 * Idempotência / reconciliação com resumePayment (D11):
 *   - Só age se a assinatura AINDA estiver `PENDING_PAYMENT`. Se um pagamento foi
 *     capturado nesse meio-tempo (→ ACTIVE), é no-op.
 *   - `resumePayment` re-arma a janela, então uma retomada dentro do prazo nunca
 *     é cancelada por baixo do consumidor.
 *   - A transação interativa serializa contra o webhook de ativação.
 */
export async function processSubscriptionExpiration(
  job: Job<SubscriptionExpirationJobPayload>
): Promise<ExpirationResult> {
  const { subscriptionId, correlationId } = job.data;
  log.info({ subscriptionId, correlationId, jobId: job.id }, "Subscription expiration job started");

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      return { action: "skipped" as const, reason: "subscription_not_found" };
    }

    if (subscription.status !== UserSubscriptionStatus.PENDING_PAYMENT) {
      log.info(
        { subscriptionId, currentStatus: subscription.status },
        "Subscription already progressed beyond pending payment — skipping expiration"
      );
      return {
        action: "skipped" as const,
        reason: "subscription_already_progressed",
        status: subscription.status,
      };
    }

    // Marca o pagamento pendente mais recente como EXPIRED (se existir).
    const payment = await tx.payment.findFirst({
      where: {
        user_subscription_id: subscriptionId,
        kind: PaymentKind.SUBSCRIPTION,
      },
      orderBy: { created_at: "desc" },
    });

    if (payment && PENDING_PAYMENT_STATUSES.has(payment.status)) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.EXPIRED },
      });
    }

    await tx.userSubscription.update({
      where: { id: subscriptionId },
      data: { status: UserSubscriptionStatus.CANCELLED },
    });

    await auditRepository.emit(
      {
        eventType: AuditEventType.PAYMENT_EXPIRED,
        actor: { type: ActorType.SYSTEM, id: "subscription-expiration-worker" },
        sourceApp: SourceApp.BACKEND,
        payload: {
          subscriptionId,
          correlationId,
          paymentId: payment?.id ?? null,
          previousStatus: subscription.status,
        },
      },
      tx
    );

    log.info({ subscriptionId, paymentId: payment?.id ?? null }, "Subscription expired (payment timeout)");
    return { action: "expired" as const, subscriptionId, paymentId: payment?.id ?? null };
  }, { maxWait: 10_000, timeout: 15_000 });
}
