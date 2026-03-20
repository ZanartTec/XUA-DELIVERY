import type { Knex } from "knex";
import db from "@/src/lib/db";
import type { Consumer } from "@/src/types";

const TABLE = "01_mst_consumers";

// SEC-07: Colunas seguras para retorno (NUNCA incluir password_hash)
const SAFE_COLUMNS = ["id", "name", "email", "phone", "is_b2b", "created_at", "updated_at"] as const;

export const consumerRepository = {
  async findById(id: string, trx?: Knex.Transaction): Promise<Consumer | null> {
    const query = (trx || db)(TABLE).where({ id }).first();
    return (await query) || null;
  },

  async findByEmail(email: string, trx?: Knex.Transaction): Promise<Consumer | null> {
    const query = (trx || db)(TABLE).where({ email }).first();
    return (await query) || null;
  },

  async create(
    data: Pick<Consumer, "name" | "email" | "password_hash">,
    trx?: Knex.Transaction
  ): Promise<Consumer> {
    const [consumer] = await (trx || db)(TABLE).insert(data).returning([...SAFE_COLUMNS]);
    return consumer;
  },

  async update(
    id: string,
    data: Partial<Pick<Consumer, "name" | "email" | "phone">>,
    trx?: Knex.Transaction
  ): Promise<Consumer> {
    const [consumer] = await (trx || db)(TABLE)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning([...SAFE_COLUMNS]);
    return consumer;
  },
};
