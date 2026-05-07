import type { Prisma, DistributorSchedule, DistributorBlockedDate } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

export const scheduleRepository = {
  async findScheduleByDistributor(
    distributorId: string,
    tx?: TxClient
  ): Promise<DistributorSchedule[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).distributorSchedule.findMany({
      where: { distributor_id: distributorId },
      orderBy: { weekday: "asc" },
    });
  },

  async findBlockedDates(
    distributorId: string,
    startDate: string,
    endDate: string,
    tx?: TxClient
  ): Promise<DistributorBlockedDate[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).distributorBlockedDate.findMany({
      where: {
        distributor_id: distributorId,
        blocked_date: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T00:00:00.000Z`),
        },
      },
      orderBy: { blocked_date: "asc" },
    });
  },

  async upsertWeekday(
    distributorId: string,
    weekday: number,
    data: { is_active: boolean; lead_time_hours?: number },
    tx?: TxClient
  ): Promise<DistributorSchedule> {
    const prisma = getPrisma();
    return (tx ?? prisma).distributorSchedule.upsert({
      where: {
        distributor_id_weekday: { distributor_id: distributorId, weekday },
      },
      create: {
        distributor_id: distributorId,
        weekday,
        is_active: data.is_active,
        lead_time_hours: data.lead_time_hours ?? 2,
      },
      update: {
        is_active: data.is_active,
        ...(data.lead_time_hours !== undefined ? { lead_time_hours: data.lead_time_hours } : {}),
      },
    });
  },

  async blockDate(
    distributorId: string,
    date: string,
    reason?: string,
    tx?: TxClient
  ): Promise<DistributorBlockedDate> {
    const prisma = getPrisma();
    return (tx ?? prisma).distributorBlockedDate.create({
      data: {
        distributor_id: distributorId,
        blocked_date: new Date(`${date}T00:00:00.000Z`),
        reason: reason ?? null,
      },
    });
  },

  async unblockDate(
    distributorId: string,
    date: string,
    tx?: TxClient
  ): Promise<void> {
    const prisma = getPrisma();
    await (tx ?? prisma).distributorBlockedDate.deleteMany({
      where: {
        distributor_id: distributorId,
        blocked_date: new Date(`${date}T00:00:00.000Z`),
      },
    });
  },
};
