import type { Prisma, Subscription } from "@prisma/client";
import { SubscriptionStatus, AuditEventType, ActorType, SourceApp } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";
import { auditRepository } from "../audit/index.js";

type TxClient = Prisma.TransactionClient;

export const subscriptionService = {
  async pause(subscriptionId: string, consumerId: string): Promise<Subscription> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (!sub) throw new Error("SUBSCRIPTION_NOT_FOUND");
      if (sub.consumer_id !== consumerId) throw new Error("FORBIDDEN");
      if (sub.status !== SubscriptionStatus.ACTIVE) throw new Error("INVALID_STATUS");

      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.PAUSED },
      });

      await auditRepository.emit(
        {
          eventType: AuditEventType.ORDER_CANCELLED,
          actor: { type: ActorType.CONSUMER, id: consumerId },
          orderId: null,
          sourceApp: SourceApp.CONSUMER_WEB,
          payload: { subscriptionId, action: "pause" },
        },
        tx
      );

      return updated;
    });
  },

  async resume(subscriptionId: string, consumerId: string): Promise<Subscription> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (!sub) throw new Error("SUBSCRIPTION_NOT_FOUND");
      if (sub.consumer_id !== consumerId) throw new Error("FORBIDDEN");
      if (sub.status !== SubscriptionStatus.PAUSED) throw new Error("INVALID_STATUS");

      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });

      return updated;
    });
  },

  async cancel(subscriptionId: string, consumerId: string): Promise<Subscription> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (!sub) throw new Error("SUBSCRIPTION_NOT_FOUND");
      if (sub.consumer_id !== consumerId) throw new Error("FORBIDDEN");
      if (sub.status === SubscriptionStatus.CANCELLED) throw new Error("ALREADY_CANCELLED");

      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.CANCELLED },
      });

      return updated;
    });
  },
};
