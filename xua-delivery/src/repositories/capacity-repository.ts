import type { Knex } from "knex";
import db from "@/src/lib/db";
import type { DeliveryCapacity, DeliveryWindow } from "@/src/types";

const TABLE = "07_cfg_delivery_capacity";

export const capacityRepository = {
  /**
   * Busca slot com SELECT FOR UPDATE — anti-overbooking (seção 2.4).
   * DEVE ser chamado dentro de uma transação Knex.
   */
  async findSlotForUpdate(
    zoneId: string,
    date: string,
    window: DeliveryWindow,
    trx: Knex.Transaction
  ): Promise<DeliveryCapacity | null> {
    const slot = await trx(TABLE)
      .where({ zone_id: zoneId, delivery_date: date, window })
      .forUpdate()
      .first();

    return slot || null;
  },

  async findAvailable(
    zoneId: string,
    startDate: string,
    endDate: string,
    trx?: Knex.Transaction
  ): Promise<DeliveryCapacity[]> {
    return (trx || db)(TABLE)
      .where({ zone_id: zoneId })
      .whereBetween("delivery_date", [startDate, endDate])
      .whereRaw("capacity_reserved < capacity_total")
      .orderBy("delivery_date", "asc");
  },

  /**
   * Incrementa reserva do slot — dentro da mesma transação do findSlotForUpdate.
   */
  async reserve(id: string, trx: Knex.Transaction): Promise<void> {
    await trx(TABLE)
      .where({ id })
      .increment("capacity_reserved", 1)
      .update({ updated_at: new Date() });
  },
};
