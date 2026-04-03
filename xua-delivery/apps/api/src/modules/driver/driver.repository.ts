import type { Order, Consumer, Address, Prisma } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

export type OrderWithConsumer = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
};

export type OrderWithConsumerAndAddress = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Address | null;
};

export const driverRepository = {
  async findTodayDeliveries(
    driverId: string,
    tx?: TxClient
  ): Promise<OrderWithConsumer[]> {
    const prisma = getPrisma();
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = new Date(today + "T00:00:00Z");
    const dayEnd = new Date(today + "T23:59:59.999Z");

    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        status: {
          in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
        },
        delivery_date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        consumer: { select: { name: true, phone: true } },
      },
      orderBy: { delivery_date: "asc" },
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
  ): Promise<Order[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        status: {
          in: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
        },
      },
      orderBy: { delivered_at: "desc" },
      take: limit,
      skip: offset,
    });
  },
};
