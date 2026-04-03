import { getPrisma } from "../../../infra/prisma/client.js";

export const distributorRepository = {
  async findAllActive() {
    const prisma = getPrisma();
    return prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
    });
  },
};
