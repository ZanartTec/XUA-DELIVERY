import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

const defaultInclude = {
  product: { select: { id: true, name: true, price_cents: true, image_url: true } },
  distributors: {
    include: {
      distributor: {
        select: {
          id: true,
          name: true,
          // Apenas para derivar mp_connected no service — nunca exposto cru.
          payment_settings: { select: { mp_access_token_enc: true, mp_webhook_secret_enc: true } },
        },
      },
    },
  },
} satisfies Prisma.SubscriptionPlanInclude;

export const subscriptionPlansRepository = {
  async findAll(activeOnly = false) {
    const prisma = getPrisma();
    return prisma.subscriptionPlan.findMany({
      where: activeOnly ? { is_active: true } : undefined,
      include: defaultInclude,
      orderBy: { created_at: "desc" },
    });
  },

  async findById(id: string) {
    const prisma = getPrisma();
    return prisma.subscriptionPlan.findUnique({
      where: { id },
      include: defaultInclude,
    });
  },

  async create(
    data: Prisma.SubscriptionPlanCreateInput & { distributor_ids: string[] },
    tx?: TxClient
  ) {
    const client = tx ?? getPrisma();
    const { distributor_ids, ...planData } = data;
    return client.subscriptionPlan.create({
      data: {
        ...planData,
        distributors: {
          create: distributor_ids.map((distributor_id) => ({ distributor_id })),
        },
      },
      include: defaultInclude,
    });
  },

  async update(
    id: string,
    data: Prisma.SubscriptionPlanUpdateInput & { distributor_ids?: string[] }
  ) {
    const prisma = getPrisma();
    const { distributor_ids, ...planData } = data;
    return prisma.$transaction(async (tx) => {
      if (distributor_ids !== undefined) {
        await tx.subscriptionPlanDistributor.deleteMany({ where: { plan_id: id } });
        await tx.subscriptionPlanDistributor.createMany({
          data: distributor_ids.map((distributor_id) => ({ plan_id: id, distributor_id })),
        });
      }
      return tx.subscriptionPlan.update({
        where: { id },
        data: planData,
        include: defaultInclude,
      });
    });
  },
};
