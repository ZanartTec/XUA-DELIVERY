import { Prisma, OtpStatus } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { OrderOtp } from "@/src/types";

type TxClient = Prisma.TransactionClient;

export const otpRepository = {
  async create(
    data: { order_id: string; otp_hash: string; expires_at: Date },
    tx?: TxClient
  ): Promise<OrderOtp> {
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

  async findActive(
    orderId: string,
    tx?: TxClient
  ): Promise<OrderOtp | null> {
    return (tx ?? prisma).orderOtp.findFirst({
      where: { order_id: orderId, status: OtpStatus.ACTIVE },
    });
  },

  // FUNC-01: SELECT FOR UPDATE para evitar race condition em validações concorrentes
  async findActiveForUpdate(
    orderId: string,
    tx: TxClient
  ): Promise<OrderOtp | null> {
    const rows = await tx.$queryRaw<OrderOtp[]>`
      SELECT * FROM "16_sec_order_otps"
      WHERE order_id = ${orderId}::uuid
        AND status = 'active'
      FOR UPDATE
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async incrementAttempts(
    id: string,
    tx?: TxClient
  ): Promise<OrderOtp> {
    return (tx ?? prisma).orderOtp.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },

  async markUsed(id: string, tx?: TxClient): Promise<void> {
    await (tx ?? prisma).orderOtp.update({
      where: { id },
      data: { status: OtpStatus.USED },
    });
  },

  async markLocked(id: string, tx?: TxClient): Promise<void> {
    await (tx ?? prisma).orderOtp.update({
      where: { id },
      data: { status: OtpStatus.LOCKED },
    });
  },

  /** Expira OTPs ativos além do TTL (90 min) — chamado pelo cron a cada 15min */
  async expireOldOtps(tx?: TxClient): Promise<number> {
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
