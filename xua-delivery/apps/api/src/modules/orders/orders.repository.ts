import type { Prisma, Order, OrderStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

/**
 * OrderRepository — CRUD e queries de pedidos.
 * Todas as funções aceitam um TxClient opcional para operações transacionais.
 */
export const orderRepository = {
  async findById(id: string, tx?: TxClient): Promise<Order | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findUnique({ where: { id } });
  },

  async findByIdWithItems(
    id: string,
    tx?: TxClient
  ): Promise<(Order & { items: { id: string; product_name: string; quantity: number; unit_price_cents: number; subtotal_cents: number }[] }) | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findUnique({
      where: { id },
      include: { items: true },
    });
  },

  async findByConsumer(
    consumerId: string,
    options?: { status?: OrderStatus; limit?: number; offset?: number },
    tx?: TxClient
  ): Promise<Order[]> {
    const prisma = getPrisma();
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
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        distributor_id: distributorId,
        ...(status ? { status } : {}),
      },
      orderBy: { created_at: "desc" },
    });
  },

  async findByDriver(
    driverId: string,
    status?: OrderStatus,
    date?: Date,
    tx?: TxClient
  ): Promise<Order[]> {
    const prisma = getPrisma();
    const startOfDay = date ? new Date(date.setHours(0, 0, 0, 0)) : undefined;
    const endOfDay = date ? new Date(date.setHours(23, 59, 59, 999)) : undefined;

    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        ...(status ? { status } : {}),
        ...(startOfDay && endOfDay
          ? { delivery_date: { gte: startOfDay, lte: endOfDay } }
          : {}),
      },
      orderBy: { created_at: "desc" },
    });
  },

  async findAll(
    options?: { status?: OrderStatus; limit?: number; offset?: number },
    tx?: TxClient
  ): Promise<Order[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: options?.status ? { status: options.status } : {},
      orderBy: { created_at: "desc" },
      ...(options?.limit ? { take: options.limit } : {}),
      ...(options?.offset ? { skip: options.offset } : {}),
    });
  },

  async create(
    data: Omit<Order, "id" | "created_at" | "updated_at">,
    tx?: TxClient
  ): Promise<Order> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.create({ data });
  },

  async updateStatus(
    id: string,
    status: OrderStatus,
    extra?: Partial<Order>,
    tx?: TxClient
  ): Promise<Order> {
    const prisma = getPrisma();
    // Remove campos imutáveis do extra
    const { id: _id, created_at: _ca, updated_at: _ua, ...safeExtra } =
      (extra ?? {}) as Partial<Order>;
    return (tx ?? prisma).order.update({
      where: { id },
      data: { status, ...safeExtra },
    });
  },

  async update(
    id: string,
    data: Partial<Omit<Order, "id" | "created_at" | "updated_at">>,
    tx?: TxClient
  ): Promise<Order> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.update({
      where: { id },
      data,
    });
  },
};
