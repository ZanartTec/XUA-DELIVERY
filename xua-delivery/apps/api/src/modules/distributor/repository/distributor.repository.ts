import { getPrisma } from "../../../infra/prisma/client.js";
import { ConsumerRole } from "@prisma/client";

export const distributorRepository = {
  async findAllActive() {
    const prisma = getPrisma();
    return prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
    });
  },

  async findDriversByDistributor(distributorId: string): Promise<Array<{ id: string; name: string }>> {
    const prisma = getPrisma();
    const linkedDrivers = await prisma.consumer.findMany({
      where: { role: ConsumerRole.DRIVER, distributor_id: distributorId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (linkedDrivers.length > 0) {
      return linkedDrivers;
    }

    const activeDistributors = await prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    if (activeDistributors.length !== 1 || activeDistributors[0]?.id !== distributorId) {
      return [];
    }

    const orphanDrivers = await prisma.consumer.findMany({
      where: { role: ConsumerRole.DRIVER, distributor_id: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (orphanDrivers.length === 0) {
      return [];
    }

    await prisma.consumer.updateMany({
      where: {
        id: { in: orphanDrivers.map((driver) => driver.id) },
        distributor_id: null,
      },
      data: { distributor_id: distributorId },
    });

    return orphanDrivers;
  },

  /**
   * Resolve o distributor_id (empresa) a partir do ID do usuário logado.
   * Retorna null se o usuário não estiver vinculado a nenhuma distribuidora.
   */
  async resolveDistributorId(userId: string): Promise<string | null> {
    const prisma = getPrisma();
    const consumer = await prisma.consumer.findUnique({
      where: { id: userId },
      select: { distributor_id: true, role: true },
    });

    if (!consumer) {
      return null;
    }

    if (consumer.distributor_id) {
      return consumer.distributor_id;
    }

    if (consumer.role !== ConsumerRole.DRIVER) {
      return null;
    }

    const activeDistributors = await prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    if (activeDistributors.length !== 1) {
      return null;
    }

    const inferredDistributorId = activeDistributors[0]!.id;
    await prisma.consumer.update({
      where: { id: userId },
      data: { distributor_id: inferredDistributorId },
    });

    return inferredDistributorId;
  },
};
