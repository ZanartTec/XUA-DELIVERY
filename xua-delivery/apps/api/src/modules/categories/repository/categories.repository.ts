import { getPrisma } from "../../../infra/prisma/client.js";

export const categoriesRepository = {
  async findAll() {
    const prisma = getPrisma();
    return prisma.category.findMany({
      select: {
        id: true,
        name: true,
        value: true,
        sort_order: true,
      },
      orderBy: { sort_order: "asc" },
    });
  },
};
