import type { Prisma } from "@prisma/client";
import type { UserSubscriptionStatus } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

const defaultInclude = {
  plan: {
    include: {
      product: { select: { id: true, name: true, image_url: true } },
    },
  },
  distributor: { select: { id: true, name: true } },
  address: true,
  delivery_dates: {
    orderBy: { delivery_date: "asc" as const },
    include: { time_slot: true },
  },
  payments: {
    orderBy: { created_at: "desc" as const },
    take: 1,
    select: {
      id: true,
      status: true,
      amount_cents: true,
      payment_method: true,
      provider: true,
      external_id: true,
      created_at: true,
    },
  },
} satisfies Prisma.UserSubscriptionInclude;

export const userSubscriptionsRepository = {
  async findByConsumer(consumerId: string) {
    const prisma = getPrisma();
    return prisma.userSubscription.findMany({
      where: { consumer_id: consumerId },
      include: defaultInclude,
      orderBy: { created_at: "desc" },
    });
  },

  async findById(id: string) {
    const prisma = getPrisma();
    return prisma.userSubscription.findUnique({
      where: { id },
      include: defaultInclude,
    });
  },

  async findByIdWithConsumer(id: string) {
    const prisma = getPrisma();
    return prisma.userSubscription.findUnique({
      where: { id },
      include: {
        ...defaultInclude,
        consumer: true,
      },
    });
  },

  async create(
    data: {
      consumer_id: string;
      plan_id: string;
      distributor_id: string;
      address_id: string;
      total_quantity: number;
      remaining_quantity: number;
      start_date: Date;
      end_date: Date;
      status: UserSubscriptionStatus;
    },
    tx?: TxClient
  ) {
    const client = tx ?? getPrisma();
    return client.userSubscription.create({
      data,
    });
  },

  async updateStatus(id: string, status: UserSubscriptionStatus, tx?: TxClient) {
    const client = tx ?? getPrisma();
    return client.userSubscription.update({
      where: { id },
      data: { status },
    });
  },

  async decrementRemaining(id: string, amount: number, tx: TxClient) {
    return tx.userSubscription.update({
      where: { id },
      data: { remaining_quantity: { decrement: amount } },
    });
  },

  async markLowBalanceNotificationSent(id: string, tx?: TxClient) {
    const client = tx ?? getPrisma();
    return client.userSubscription.update({
      where: { id },
      data: { low_balance_notification_sent_at: new Date() },
    });
  },

  async updateDeliveryDateSchedule(
    id: string,
    data: { delivery_date: Date; time_slot_id: string },
    tx?: TxClient
  ) {
    const client = tx ?? getPrisma();
    return client.subscriptionDeliveryDate.update({
      where: { id },
      data,
    });
  },

  async updateDateRange(
    id: string,
    data: { start_date: Date; end_date: Date },
    tx?: TxClient
  ) {
    const client = tx ?? getPrisma();
    return client.userSubscription.update({
      where: { id },
      data,
    });
  },

  async createDeliveryDates(
    entries: Array<{
      user_subscription_id: string;
      delivery_date: Date;
      time_slot_id: string;
      quantity_for_this_delivery: number;
    }>,
    tx?: TxClient
  ) {
    const client = tx ?? getPrisma();
    return client.subscriptionDeliveryDate.createMany({ data: entries });
  },

  async findPendingDeliveriesToday(today: Date) {
    const prisma = getPrisma();
    return prisma.subscriptionDeliveryDate.findMany({
      where: {
        delivery_date: today,
        status: "PENDING",
        user_subscription: { status: "ACTIVE" },
        order_id: null,
      },
      include: {
        user_subscription: {
          include: {
            consumer: true,
            address: true,
            plan: { include: { product: true } },
          },
        },
        time_slot: true,
      },
    });
  },
};
