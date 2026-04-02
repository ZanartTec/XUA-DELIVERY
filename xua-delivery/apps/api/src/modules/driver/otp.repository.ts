import type { Prisma, OrderOtp } from "@prisma/client";
import { OtpStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

/**
 * OtpRepository — operações de persistência de OTPs.
 * SELECT FOR UPDATE para evitar race conditions (FUNC-01).
 */
export const otpRepository = {
  async create(
    data: { order_id: string; otp_hash: string; expires_at: Date },
    tx?: TxClient
  ): Promise<OrderOtp> {
    const prisma = getPrisma();
    return (tx ?? prisma).orderOtp.create({
      data: {
        order_id: data.order_id,
        otp_hash: data.otp_hash,
        status: OtpStatus.ACTIVE,
        attempts: 0,
        expires_at: data.expires_at,
      },
    });
  },

  async findActive(orderId: string, tx?: TxClient): Promise<OrderOtp | null> {
    const prisma = getPrisma();
    return (tx ?? prisma).orderOtp.findFirst({
      where: { order_id: orderId, status: OtpStatus.ACTIVE },
    });
  },

  /**
   * SELECT FOR UPDATE para evitar race condition em validações concorrentes.
   * DEVE ser usado dentro de transação.
   */
  async findActiveForUpdate(orderId: string, tx: TxClient): Promise<OrderOtp | null> {
    const rows = await tx.$queryRaw<OrderOtp[]>`
      SELECT * FROM "16_sec_order_otps"
      WHERE order_id = ${orderId}::uuid
        AND status = 'active'
      FOR UPDATE
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async incrementAttempts(id: string, tx?: TxClient): Promise<OrderOtp> {
    const prisma = getPrisma();
    return (tx ?? prisma).orderOtp.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },

  async markUsed(id: string, tx?: TxClient): Promise<void> {
    const prisma = getPrisma();
    await (tx ?? prisma).orderOtp.update({
      where: { id },
      data: { status: OtpStatus.USED },
    });
  },

  async markLocked(id: string, tx?: TxClient): Promise<void> {
    const prisma = getPrisma();
    await (tx ?? prisma).orderOtp.update({
      where: { id },
      data: { status: OtpStatus.LOCKED },
    });
  },

  /**
   * Expira OTPs ativos além do TTL (90 min).
   * Chamado por cron job a cada 15 minutos.
   */
  async expireOldOtps(tx?: TxClient): Promise<number> {
    const prisma = getPrisma();
    const result = await (tx ?? prisma).orderOtp.updateMany({
      where: {
        status: OtpStatus.ACTIVE,
        expires_at: { lt: new Date() },
      },
      data: { status: OtpStatus.EXPIRED },
    });
    return result.count;
  },
};
