import type { Prisma, DeliveryCapacity } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

/**
 * CapacityRepository — SELECT FOR UPDATE para evitar overbooking (ARCH-04).
 */
export const capacityRepository = {
  /**
   * SELECT FOR UPDATE — anti-overbooking (seção 2.4).
   * DEVE ser chamado dentro de uma transação Prisma.
   */
  async findSlotForUpdate(
    zoneId: string,
    date: string,
    window: string,
    tx: TxClient
  ): Promise<DeliveryCapacity | null> {
    const rows = await tx.$queryRaw<DeliveryCapacity[]>`
      SELECT * FROM "07_cfg_delivery_capacity"
      WHERE zone_id = ${zoneId}::uuid
        AND delivery_date = ${date}::date
        AND "window" = ${window}
      FOR UPDATE
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async findAvailable(
    zoneId: string,
    startDate: string,
    endDate: string,
    tx?: TxClient
  ): Promise<DeliveryCapacity[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).$queryRaw<DeliveryCapacity[]>`
      SELECT * FROM "07_cfg_delivery_capacity"
      WHERE zone_id = ${zoneId}::uuid
        AND delivery_date BETWEEN ${startDate}::date AND ${endDate}::date
        AND capacity_reserved < capacity_total
      ORDER BY delivery_date ASC
    `;
  },

  /** Incrementa reserva do slot — dentro da mesma transação do findSlotForUpdate. */
  async reserve(id: string, tx: TxClient): Promise<void> {
    await tx.deliveryCapacity.update({
      where: { id },
      data: { capacity_reserved: { increment: 1 } },
    });
  },

  /** Decrementa reserva — chamado em cancelamentos. */
  async release(id: string, tx: TxClient): Promise<void> {
    await tx.deliveryCapacity.update({
      where: { id },
      data: { capacity_reserved: { decrement: 1 } },
    });
  },
};
