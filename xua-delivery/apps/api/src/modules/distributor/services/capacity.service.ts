import type { Prisma, DeliveryWindow } from "@prisma/client";
import { capacityRepository } from "../repository/capacity.repository.js";
import { logger } from "../../../infra/logger/index.js";

type TxClient = Prisma.TransactionClient;

export const capacityService = {
  /** Verifica disponibilidade de slots em uma janela de datas. */
  async checkAvailability(
    zoneId: string,
    startDate: string,
    endDate: string,
    tx?: TxClient
  ) {
    return capacityRepository.findAvailable(zoneId, startDate, endDate, tx);
  },

  /**
   * Reserva slot de entrega — SELECT FOR UPDATE anti-overbooking (ARCH-04).
   * DEVE ser chamado dentro de uma transação.
   * @throws Error se não houver slots disponíveis.
   */
  async reserve(
    zoneId: string,
    deliveryDate: string,
    deliveryWindow: DeliveryWindow,
    tx: TxClient
  ): Promise<void> {
    const slot = await capacityRepository.findSlotForUpdate(
      zoneId,
      deliveryDate,
      deliveryWindow,
      tx
    );

    if (!slot) {
      throw Object.assign(
        new Error(
          `Sem configuração de capacidade para zone=${zoneId} date=${deliveryDate} window=${deliveryWindow}`
        ),
        { status: 422 }
      );
    }

    const available = slot.capacity_total - slot.capacity_reserved;
    if (available <= 0) {
      throw Object.assign(
        new Error(
          `Sem slots disponíveis para zone=${zoneId} date=${deliveryDate} window=${deliveryWindow}`
        ),
        { status: 422 }
      );
    }

    await capacityRepository.reserve(slot.id, tx);
    logger.info(
      { zoneId, deliveryDate, deliveryWindow, remaining: available - 1 },
      "Slot reservado"
    );
  },

  /** Libera slot de entrega — chamado em cancelamentos. */
  async release(
    zoneId: string,
    deliveryDate: string,
    deliveryWindow: DeliveryWindow,
    tx: TxClient
  ): Promise<void> {
    const slot = await capacityRepository.findSlotForUpdate(
      zoneId,
      deliveryDate,
      deliveryWindow,
      tx
    );

    if (!slot) {
      logger.warn(
        { zoneId, deliveryDate, deliveryWindow },
        "Slot não encontrado para release — ignorando"
      );
      return;
    }

    if (slot.capacity_reserved <= 0) {
      logger.warn(
        { zoneId, deliveryDate, deliveryWindow },
        "capacity_reserved já é 0 — ignorando release"
      );
      return;
    }

    await capacityRepository.release(slot.id, tx);
    logger.info({ zoneId, deliveryDate, deliveryWindow }, "Slot liberado");
  },
};
