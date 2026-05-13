import type {
  Prisma,
  Order,
  OrderStatus,
  Consumer,
  Address,
  OrderItem,
  DeliveryDateStatus,
  UserSubscriptionStatus,
} from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

type OrderWithConsumer = Order & { consumer: Pick<Consumer, "name" | "email" | "phone"> };

type SubscriptionDeliveryContext = {
  id: string;
  user_subscription_id: string;
  delivery_date: Date;
  quantity_for_this_delivery: number;
  status: DeliveryDateStatus;
  created_at: Date;
  time_slot?: {
    label: string;
    start_hour: number;
    start_minute: number;
    end_hour: number;
    end_minute: number;
  } | null;
  user_subscription: {
    id: string;
    status: UserSubscriptionStatus;
    total_quantity: number;
    remaining_quantity: number;
    plan: { name: string; quantity: number };
    delivery_dates: Array<{
      id: string;
      delivery_date: Date;
      status: DeliveryDateStatus;
      order_id: string | null;
      created_at: Date;
      quantity_for_this_delivery: number;
      order: Pick<Order, "status"> | null;
    }>;
  };
};

export type OrderForQueue = Order & {
  consumer: Pick<Consumer, "name">;
  address: Pick<Address, "street" | "number" | "neighborhood">;
  items: Pick<OrderItem, "quantity" | "product_name">[];
  subscription_delivery_date: SubscriptionDeliveryContext | null;
};

export type OrderWithDetails = Order & {
  consumer: Pick<Consumer, "name" | "email" | "phone">;
  address: Pick<Address, "street" | "number" | "complement" | "neighborhood" | "city" | "state" | "zip_code">;
  items: {
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
    product_name: string;
    product: { image_url: string | null };
  }[];
  audit_events: { event_type: string; occurred_at: Date; actor_id: string }[];
  subscription_delivery_date: SubscriptionDeliveryContext | null;
};

const newSubscriptionDeliveryInclude = {
  select: {
    id: true,
    user_subscription_id: true,
    delivery_date: true,
    quantity_for_this_delivery: true,
    status: true,
    created_at: true,
    time_slot: {
      select: {
        label: true,
        start_hour: true,
        start_minute: true,
        end_hour: true,
        end_minute: true,
      },
    },
    user_subscription: {
      select: {
        id: true,
        status: true,
        total_quantity: true,
        remaining_quantity: true,
        plan: { select: { name: true, quantity: true } },
        delivery_dates: {
          orderBy: [{ delivery_date: "asc" }, { created_at: "asc" }, { id: "asc" }],
          select: {
            id: true,
            delivery_date: true,
            status: true,
            order_id: true,
            created_at: true,
            quantity_for_this_delivery: true,
            order: { select: { status: true } },
          },
        },
      },
    },
  },
} satisfies Prisma.SubscriptionDeliveryDateDefaultArgs;

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
    statuses?: OrderStatus[],
    tx?: TxClient
  ): Promise<OrderForQueue[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        distributor_id: distributorId,
        ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
      },
      orderBy: { created_at: "desc" },
      include: {
        consumer: { select: { name: true } },
        address: { select: { street: true, number: true, neighborhood: true } },
        items: { select: { quantity: true, product_name: true } },
        subscription_delivery_date: newSubscriptionDeliveryInclude,
      },
    }) as unknown as Promise<OrderForQueue[]>;
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

  async findByIdWithDetails(
    id: string,
    tx?: TxClient
  ): Promise<OrderWithDetails | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findUnique({
      where: { id },
      include: {
        consumer: {
          select: { name: true, email: true, phone: true },
        },
        address: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            zip_code: true,
          },
        },
        items: {
          select: {
            quantity: true,
            unit_price_cents: true,
            subtotal_cents: true,
            product_name: true,
            product: { select: { image_url: true } },
          },
        },
        audit_events: {
          orderBy: { occurred_at: "asc" },
          select: { event_type: true, occurred_at: true, actor_id: true },
        },
        subscription_delivery_date: newSubscriptionDeliveryInclude,
      },
    }) as unknown as Promise<OrderWithDetails | null>;
  },

  async searchBySupport(
    query: string,
    tx?: TxClient
  ): Promise<OrderWithConsumer[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        OR: [
          { consumer: { phone: { contains: query } } },
          { consumer: { email: { contains: query } } },
          { id: query },
        ],
      },
      include: {
        consumer: {
          select: { name: true, email: true, phone: true },
        },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    }) as unknown as Promise<OrderWithConsumer[]>;
  },
};
