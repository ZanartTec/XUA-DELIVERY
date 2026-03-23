import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { Order, OrderStatus } from "@/src/types";

type TxClient = Prisma.TransactionClient;

export const orderRepository = {
  async findById(id: string, tx?: TxClient): Promise<Order | null> {
    return (tx ?? prisma).order.findUnique({ where: { id } });
  },

  async findByConsumer(
    consumerId: string,
    options?: { status?: OrderStatus; limit?: number; offset?: number },
    tx?: TxClient
  ): Promise<Order[]> {
    return (tx ?? prisma).order.findMany({
      where: {
        consumer_id: consumerId,
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { created_at: "desc" },
      ...(options?.limit ? { take: options.limit } : {}),
      ...(options?.offset ? { skip: options.offset } : {}),
    });
  },

  async findByDistributor(
    distributorId: string,
    status?: OrderStatus,
    tx?: TxClient
  ): Promise<Order[]> {
    return (tx ?? prisma).order.findMany({
      where: {
        distributor_id: distributorId,
        ...(status ? { status } : {}),
      },
      orderBy: { created_at: "desc" },
    });
  },

  async create(
    data: Omit<Order, "id" | "created_at" | "updated_at">,
    tx?: TxClient
  ): Promise<Order> {
    return (tx ?? prisma).order.create({ data });
  },

  async updateStatus(
    id: string,
    status: OrderStatus,
    extra?: Partial<Order>,
    tx?: TxClient
  ): Promise<Order> {
    const { id: _id, created_at: _ca, updated_at: _ua, ...safeExtra } = extra ?? {} as Partial<Order>;
    return (tx ?? prisma).order.update({
      where: { id },
      data: { status, ...safeExtra },
    });
  },
};
