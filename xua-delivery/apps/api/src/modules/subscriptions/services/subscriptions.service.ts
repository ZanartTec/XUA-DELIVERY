import type { Prisma, Subscription } from "@prisma/client";
import { SubscriptionStatus, AuditEventType, ActorType, SourceApp } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { auditRepository } from "../../audit/index.js";
import { subscriptionRepository } from "../repository/subscriptions.repository.js";
import { timeslotRepository } from "../../distributor/repository/timeslot.repository.js";
import { scheduleRepository } from "../../distributor/repository/schedule.repository.js";
import { nextWeekdayDate } from "../../../utils/date.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("subscriptions");

type TxClient = Prisma.TransactionClient;

export const subscriptionService = {
  async list(consumerId: string) {
    return subscriptionRepository.findByConsumer(consumerId);
  },

  async create(
    consumerId: string,
    data: {
      qty_20l: number;
      weekdays: number[];
      time_slot_id: string;
      product_id?: string;
      address_id?: string;
      zone_id?: string;
    }
  ) {
    const prisma = getPrisma();

    if (data.product_id) {
      const product = await prisma.product.findUnique({ where: { id: data.product_id } });
      if (!product || !product.is_active) throw new Error("PRODUCT_NOT_FOUND");
    }

    const slot = await timeslotRepository.findById(data.time_slot_id);
    if (!slot) throw new Error("TIME_SLOT_NOT_FOUND");
    if (!slot.is_active) throw new Error("TIME_SLOT_INACTIVE");

    const schedule = await scheduleRepository.findScheduleByDistributor(
      slot.distributor_id
    );
    const activeWeekdays = new Set(
      schedule.filter((s) => s.is_active).map((s) => s.weekday)
    );
    for (const w of data.weekdays) {
      if (!activeWeekdays.has(w)) throw new Error("WEEKDAY_NOT_AVAILABLE");
    }

    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const nextDateStr = nextWeekdayDate(data.weekdays, todayUtc, true);

    const sub = await subscriptionRepository.create({
      consumer_id: consumerId,
      qty_20l: data.qty_20l,
      weekdays: data.weekdays,
      time_slot_id: data.time_slot_id,
      distributor_id: slot.distributor_id,
      status: SubscriptionStatus.ACTIVE,
      next_delivery_date: new Date(nextDateStr + "T00:00:00.000Z"),
      ...(data.product_id ? { product_id: data.product_id } : {}),
      ...(data.address_id ? { address_id: data.address_id } : {}),
      ...(data.zone_id ? { zone_id: data.zone_id } : {}),
    });
    log.info(
      { subscriptionId: sub.id, consumerId, weekdays: data.weekdays },
      "Subscription created"
    );
    return sub;
  },

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

      log.info({ subscriptionId, consumerId }, "Subscription paused");
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

      log.info({ subscriptionId, consumerId }, "Subscription resumed");
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

      log.info({ subscriptionId, consumerId }, "Subscription cancelled");
      return updated;
    });
  },
};
