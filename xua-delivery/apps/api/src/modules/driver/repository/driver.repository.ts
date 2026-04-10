import type { Order, Consumer, Address, OrderItem, Prisma } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

export type OrderWithConsumer = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state"> | null;
  items: Pick<OrderItem, "quantity">[];
};

export type OrderWithConsumerAndAddress = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Address | null;
};

export type OrderHistoryWithConsumer = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state"> | null;
  items: Pick<OrderItem, "quantity">[];
};

export const driverRepository = {
  async findTodayDeliveries(
    driverId: string,
    date?: Date,
    tx?: TxClient
  ): Promise<OrderWithConsumer[]> {
    const prisma = getPrisma();
    const targetDate = date ?? new Date();
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        status: {
          in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
        },
        delivery_date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        consumer: { select: { name: true, phone: true } },
        address: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
        items: { select: { quantity: true } },
      },
      orderBy: [
        { status: "asc" },
        { delivery_window: "asc" },
        { created_at: "asc" },
      ],
    }) as unknown as Promise<OrderWithConsumer[]>;
  },

  async findPendingDeliveries(
    driverId: string,
    tx?: TxClient
  ): Promise<OrderWithConsumerAndAddress[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        status: OrderStatus.OUT_FOR_DELIVERY,
      },
      include: {
        consumer: { select: { name: true, phone: true } },
        address: true,
      },
      orderBy: { delivery_date: "asc" },
    }) as unknown as Promise<OrderWithConsumerAndAddress[]>;
  },

  async findDeliveryHistory(
    driverId: string,
    limit: number,
    offset: number,
    tx?: TxClient
  ): Promise<OrderHistoryWithConsumer[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        status: {
          in: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
        },
      },
      include: {
        consumer: { select: { name: true, phone: true } },
        address: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
        items: { select: { quantity: true } },
      },
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset,
    }) as unknown as Promise<OrderHistoryWithConsumer[]>;
  },
};
