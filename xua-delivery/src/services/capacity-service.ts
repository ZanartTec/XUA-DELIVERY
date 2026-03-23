import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { capacityRepository } from "@/src/repositories/capacity-repository";
import type { DeliveryCapacity, DeliveryWindow } from "@/src/types";

type TxClient = Prisma.TransactionClient;

/**
 * CapacityService — Anti-overbooking via SELECT FOR UPDATE (seção 2.4).
 * Dois checkouts simultâneos: um passa, outro recebe 409.
 */
export const capacityService = {
  /** Retorna slots disponíveis para os próximos 7 dias */
  async checkAvailability(
    zoneId: string,
    startDate: string,
    endDate: string
  ): Promise<DeliveryCapacity[]> {
    return capacityRepository.findAvailable(zoneId, startDate, endDate);
  },

  /**
   * Reserva um slot — aceita transação externa (PERF-03/ARCH-04).
   * Se slot cheio, lança erro que o Route Handler converte em 409.
   */
  async reserve(
    zoneId: string,
    date: string,
    window: DeliveryWindow,
    externalTx?: TxClient
  ): Promise<void> {
    const execute = async (tx: TxClient) => {
      const slot = await capacityRepository.findSlotForUpdate(
        zoneId,
        date,
        window,
        tx
      );

      if (!slot) {
        throw new Error("SLOT_NOT_FOUND");
      }

      if (slot.capacity_reserved >= slot.capacity_total) {
        throw new Error("SLOT_FULL");
      }

      await capacityRepository.reserve(slot.id, tx);
    };

    if (externalTx) {
      await execute(externalTx);
    } else {
      await prisma.$transaction(execute);
    }
  },
};
