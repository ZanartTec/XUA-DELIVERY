import type { Knex } from "knex";
import db from "@/src/lib/db";
import type { Order, OrderStatus } from "@/src/types";

const TABLE = "09_trn_orders";

export const orderRepository = {
  async findById(id: string, trx?: Knex.Transaction): Promise<Order | null> {
    const query = (trx || db)(TABLE).where({ id }).first();
    return (await query) || null;
  },

  async findByConsumer(
    consumerId: string,
    options?: { status?: OrderStatus; limit?: number; offset?: number },
    trx?: Knex.Transaction
  ): Promise<Order[]> {
    let query = (trx || db)(TABLE)
      .where({ consumer_id: consumerId })
      .orderBy("created_at", "desc");

    if (options?.status) query = query.where({ status: options.status });
    if (options?.limit) query = query.limit(options.limit);
    if (options?.offset) query = query.offset(options.offset);

    return query;
  },

  async findByDistributor(
    distributorId: string,
    status?: OrderStatus,
    trx?: Knex.Transaction
  ): Promise<Order[]> {
    let query = (trx || db)(TABLE)
      .where({ distributor_id: distributorId })
      .orderBy("created_at", "desc");

    if (status) query = query.where({ status });

    return query;
  },

  async create(
    data: Omit<Order, "id" | "created_at" | "updated_at">,
    trx?: Knex.Transaction
  ): Promise<Order> {
    const [order] = await (trx || db)(TABLE).insert(data).returning("*");
    return order;
  },

  async updateStatus(
    id: string,
    status: OrderStatus,
    extra?: Partial<Order>,
    trx?: Knex.Transaction
  ): Promise<Order> {
    const [order] = await (trx || db)(TABLE)
      .where({ id })
      .update({ status, ...extra, updated_at: new Date() })
      .returning("*");
    return order;
  },
};
