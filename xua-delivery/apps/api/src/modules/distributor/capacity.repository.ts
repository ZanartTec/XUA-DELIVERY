import type { Prisma, DeliveryCapacity, DeliveryWindow } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

/**
 * CapacityRepository — Stub para PR 08.
 * SELECT FOR UPDATE para evitar overbooking (ARCH-04).
 */
export const capacityRepository = {
  async findForUpdate(
    zoneId: string,
    date: Date,
    window: DeliveryWindow,
    tx: TxClient
  ): Promise<DeliveryCapacity | null> {
    const rows = await tx.$queryRaw<DeliveryCapacity[]>`
      SELECT * FROM "09_cap_delivery_capacity"
      WHERE zone_id = ${zoneId}::uuid
        AND date = ${date}::date
        AND window = ${window}::"DeliveryWindow"
      FOR UPDATE
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async decrementSlots(id: string, tx: TxClient): Promise<DeliveryCapacity> {
    const prisma = getPrisma();
    return (tx ?? prisma).deliveryCapacity.update({
      where: { id },
      data: { capacity_reserved: { increment: 1 } },
    });
  },
};
