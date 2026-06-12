import type { Order, Consumer, Address, OrderItem, Payment, Prisma } from "@prisma/client";
import { OrderStatus } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

type DeliveryPayment = Pick<Payment, "id" | "status" | "amount_cents" | "payment_method" | "cash_change_for_cents" | "provider" | "paid_at" | "created_at">;

export type OrderWithConsumer = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state"> | null;
  items: Pick<OrderItem, "quantity">[];
  payments: DeliveryPayment[];
};

export type OrderWithConsumerAndAddress = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Address | null;
  payments: DeliveryPayment[];
};

export type OrderHistoryWithConsumer = Order & {
  consumer: Pick<Consumer, "name" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state"> | null;
  items: Pick<OrderItem, "quantity">[];
  payments: DeliveryPayment[];
};

export const driverRepository = {
  async findTodayDeliveries(
    driverId: string,
    date?: Date,
    tx?: TxClient
  ): Promise<OrderWithConsumer[]> {
    const prisma = getPrisma();

    // Filtra por data apenas se explicitamente informado; caso contrário retorna todos ativos
    const dateFilter: Prisma.OrderWhereInput = date
      ? (() => {
          const dayStart = new Date(date);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(date);
          dayEnd.setUTCHours(23, 59, 59, 999);
          return { delivery_date: { gte: dayStart, lte: dayEnd } };
        })()
      : {};

    return (tx ?? prisma).order.findMany({
      where: {
        driver_id: driverId,
        status: {
          in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
        },
        ...dateFilter,
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
        payments: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            amount_cents: true,
            payment_method: true,
            cash_change_for_cents: true,
            provider: true,
            paid_at: true,
            created_at: true,
          },
        },
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
        payments: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            amount_cents: true,
            payment_method: true,
            cash_change_for_cents: true,
            provider: true,
            paid_at: true,
            created_at: true,
          },
        },
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
        payments: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            amount_cents: true,
            payment_method: true,
            cash_change_for_cents: true,
            provider: true,
            paid_at: true,
            created_at: true,
          },
        },
      },
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset,
    }) as unknown as Promise<OrderHistoryWithConsumer[]>;
  },
};
