import { getPrisma } from "../../../infra/prisma/client.js";
import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export const timeslotRepository = {
  /** Retorna todos os slots ativos de uma distribuidora, ordenados por sort_order. */
  async findActiveByDistributor(distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).timeSlot.findMany({
      where: { distributor_id: distributorId, is_active: true },
      orderBy: { sort_order: "asc" },
    });
  },

  /** Retorna todos os slots (ativos e inativos) de uma distribuidora. */
  async findAllByDistributor(distributorId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).timeSlot.findMany({
      where: { distributor_id: distributorId },
      orderBy: { sort_order: "asc" },
    });
  },

  /** Busca slot por ID. */
  async findById(slotId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).timeSlot.findUnique({ where: { id: slotId } });
  },

  /** Cria ou atualiza um slot. */
  async upsertSlot(
    distributorId: string,
    data: {
      id?: string;
      label: string;
      start_hour: number;
      start_minute?: number;
      end_hour: number;
      end_minute?: number;
      window: "MORNING" | "AFTERNOON";
      sort_order?: number;
      is_active?: boolean;
    },
    tx?: TxClient,
  ) {
    const prisma = getPrisma();
    const client = tx ?? prisma;

    if (data.id) {
      return client.timeSlot.update({
        where: { id: data.id },
        data: {
          label: data.label,
          start_hour: data.start_hour,
          start_minute: data.start_minute ?? 0,
          end_hour: data.end_hour,
          end_minute: data.end_minute ?? 0,
          window: data.window,
          sort_order: data.sort_order ?? 0,
          is_active: data.is_active ?? true,
        },
      });
    }

    return client.timeSlot.create({
      data: {
        distributor_id: distributorId,
        label: data.label,
        start_hour: data.start_hour,
        start_minute: data.start_minute ?? 0,
        end_hour: data.end_hour,
        end_minute: data.end_minute ?? 0,
        window: data.window,
        sort_order: data.sort_order ?? 0,
        is_active: data.is_active ?? true,
      },
    });
  },

  /** Ativa/desativa um slot. */
  async toggleSlot(slotId: string, isActive: boolean, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).timeSlot.update({
      where: { id: slotId },
      data: { is_active: isActive },
    });
  },

  /** Deleta um slot permanentemente. */
  async deleteSlot(slotId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).timeSlot.delete({ where: { id: slotId } });
  },
};
