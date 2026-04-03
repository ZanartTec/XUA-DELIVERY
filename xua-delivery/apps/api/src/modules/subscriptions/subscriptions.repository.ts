import type { Prisma } from "@prisma/client";
import { SubscriptionStatus, DeliveryWindow } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

export const subscriptionRepository = {
  async findByConsumer(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).subscription.findMany({
      where: { consumer_id: consumerId },
      orderBy: { created_at: "desc" },
    });
  },

  async create(
    data: {
      consumer_id: string;
      qty_20l: number;
      weekday: number;
      delivery_window: DeliveryWindow;
      status: SubscriptionStatus;
    },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).subscription.create({ data });
  },

  async findById(id: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).subscription.findUnique({ where: { id } });
  },

  async updateStatus(id: string, status: SubscriptionStatus, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).subscription.update({
      where: { id },
      data: { status },
    });
  },
};
