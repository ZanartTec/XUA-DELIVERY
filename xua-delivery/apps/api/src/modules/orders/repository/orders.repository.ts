import type { Prisma, Order, OrderStatus, Consumer, Address, OrderItem } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

type OrderWithConsumer = Order & { consumer: Pick<Consumer, "name" | "email" | "phone"> };

export type OrderForQueue = Order & {
  consumer: Pick<Consumer, "name">;
  address: Pick<Address, "street" | "number" | "neighborhood">;
  items: Pick<OrderItem, "quantity" | "product_name">[];
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
};

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

  /**
   * Lista pedidos paginados de um consumidor, aplicando filtros no banco.
   * Retorna também contagens por grupo para os chips de filtro.
   *
   * @param statusGroup - "all" | "active" | "delivered" | "cancelled"
   */
  async findByConsumerPaged(
    consumerId: string,
    options: {
      statusGroup?: "all" | "active" | "delivered" | "cancelled";
      page: number;
      limit: number;
    },
    tx?: TxClient
  ): Promise<{ orders: Order[]; total: number; summary: Record<string, number> }> {
    const prisma = tx ?? getPrisma();

    const TERMINAL = [
      "DELIVERED" as OrderStatus,
      "CANCELLED" as OrderStatus,
      "DELIVERY_FAILED" as OrderStatus,
      "REJECTED_BY_DISTRIBUTOR" as OrderStatus,
    ];

    const whereFilter: Prisma.OrderWhereInput = (() => {
      switch (options.statusGroup) {
        case "active":
          return { consumer_id: consumerId, status: { notIn: TERMINAL } };
        case "delivered":
          return { consumer_id: consumerId, status: "DELIVERED" as OrderStatus };
        case "cancelled":
          return {
            consumer_id: consumerId,
            status: { in: ["CANCELLED", "DELIVERY_FAILED", "REJECTED_BY_DISTRIBUTOR"] as OrderStatus[] },
          };
        default:
          return { consumer_id: consumerId };
      }
    })();

    const [orders, total, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where: whereFilter,
        orderBy: { created_at: "desc" },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      prisma.order.count({ where: whereFilter }),
      prisma.order.groupBy({
        by: ["status"],
        where: { consumer_id: consumerId },
        _count: { id: true },
      }),
    ]);

    // Compute summary counts from groupBy result
    const summary: Record<string, number> = { all: 0, active: 0, delivered: 0, cancelled: 0 };
    for (const row of statusGroups) {
      const count = row._count.id;
      summary.all += count;
      if (TERMINAL.includes(row.status)) {
        if (row.status === "DELIVERED") summary.delivered += count;
        else summary.cancelled += count;
      } else {
        summary.active += count;
      }
    }

    return { orders, total, summary };
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
      },
      }) as Promise<OrderWithDetails | null>;
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
