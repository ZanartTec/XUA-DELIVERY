import type { Prisma } from "@prisma/client";
import { SubscriptionStatus } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

export const subscriptionRepository = {
  async findByConsumer(consumerId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).subscription.findMany({
      where: { consumer_id: consumerId },
      include: { time_slot: true },
      orderBy: { created_at: "desc" },
    });
  },

  async create(
    data: {
      consumer_id: string;
      qty_20l: number;
      weekdays: number[];
      time_slot_id: string;
      distributor_id: string;
      status: SubscriptionStatus;
      next_delivery_date?: Date;
      product_id?: string;
      address_id?: string;
      zone_id?: string;
    },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).subscription.create({
      data,
      include: { time_slot: true },
    });
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
