import { getPrisma } from "../../infra/prisma/client.js";

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  price_cents: true,
  deposit_cents: true,
  is_active: true,
} as const;

export const productsRepository = {
  async findActive() {
    const prisma = getPrisma();
    return prisma.product.findMany({
      where: { is_active: true },
      select: PRODUCT_SELECT,
      orderBy: { name: "asc" },
    });
  },
};
