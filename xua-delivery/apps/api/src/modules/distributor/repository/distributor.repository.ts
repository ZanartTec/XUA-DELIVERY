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
    return prisma.consumer.findMany({
      where: { role: ConsumerRole.DRIVER, distributor_id: distributorId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Resolve o distributor_id (empresa) a partir do ID do usuário logado.
   * Retorna null se o usuário não estiver vinculado a nenhuma distribuidora.
   */
  async resolveDistributorId(userId: string): Promise<string | null> {
    const prisma = getPrisma();
    const consumer = await prisma.consumer.findUnique({
      where: { id: userId },
      select: { distributor_id: true },
    });
    return consumer?.distributor_id ?? null;
  },
};
