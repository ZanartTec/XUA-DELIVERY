import type { Knex } from "knex";
import db from "@/src/lib/db";
import type { OrderOtp } from "@/src/types";

const TABLE = "16_sec_order_otps";

export const otpRepository = {
  async create(
    data: { order_id: string; otp_hash: string; expires_at: Date },
    trx?: Knex.Transaction
  ): Promise<OrderOtp> {
    const [otp] = await (trx || db)(TABLE)
      .insert({
        order_id: data.order_id,
        otp_hash: data.otp_hash,
        status: "active",
        attempts: 0,
        expires_at: data.expires_at,
      })
      .returning("*");
    return otp;
  },

  async findActive(
    orderId: string,
    trx?: Knex.Transaction
  ): Promise<OrderOtp | null> {
    const otp = await (trx || db)(TABLE)
      .where({ order_id: orderId, status: "active" })
      .first();
    return otp || null;
  },

  // FUNC-01: SELECT FOR UPDATE para evitar race condition em validações concorrentes
  async findActiveForUpdate(
    orderId: string,
    trx: Knex.Transaction
  ): Promise<OrderOtp | null> {
    const otp = await trx(TABLE)
      .where({ order_id: orderId, status: "active" })
      .forUpdate()
      .first();
    return otp || null;
  },

  async incrementAttempts(
    id: string,
    trx?: Knex.Transaction
  ): Promise<OrderOtp> {
    const [otp] = await (trx || db)(TABLE)
      .where({ id })
      .increment("attempts", 1)
      .update({ updated_at: new Date() })
      .returning("*");
    return otp;
  },

  async markUsed(id: string, trx?: Knex.Transaction): Promise<void> {
    await (trx || db)(TABLE)
      .where({ id })
      .update({ status: "used", updated_at: new Date() });
  },

  async markLocked(id: string, trx?: Knex.Transaction): Promise<void> {
    await (trx || db)(TABLE)
      .where({ id })
      .update({ status: "locked", updated_at: new Date() });
  },

  /** Expira OTPs ativos além do TTL (90 min) — chamado pelo cron a cada 15min */
  async expireOldOtps(trx?: Knex.Transaction): Promise<number> {
    return (trx || db)(TABLE)
      .where({ status: "active" })
      .where("expires_at", "<", new Date())
      .update({ status: "expired", updated_at: new Date() });
  },
};
