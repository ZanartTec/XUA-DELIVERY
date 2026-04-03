import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

export const zonesRepository = {
  async findAllActive(tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.findMany({
      where: { is_active: true },
      include: { coverage: true },
      orderBy: { name: "asc" },
    });
  },

  async create(data: Record<string, unknown>, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.create({ data: data as any });
  },

  async update(id: string, data: Record<string, unknown>, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.update({ where: { id }, data: data as any });
  },

  async softDelete(id: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zone.update({
      where: { id },
      data: { is_active: false },
    });
  },

  async createCoverage(
    data: { zone_id: string; neighborhood: string; zip_code: string },
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).zoneCoverage.create({ data });
  },

  async deleteCoverage(coverageId: string, zoneId: string, tx?: TxClient) {
    const prisma = getPrisma();
    return (tx ?? prisma).zoneCoverage.delete({
      where: { id: coverageId, zone_id: zoneId },
    });
  },
};
