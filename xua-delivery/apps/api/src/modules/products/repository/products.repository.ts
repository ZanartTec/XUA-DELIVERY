import { getPrisma } from "../../../infra/prisma/client.js";

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  image_url: true,
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

  async findAll() {
    const prisma = getPrisma();
    return prisma.product.findMany({
      select: PRODUCT_SELECT,
      orderBy: { name: "asc" },
    });
  },

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      image_url?: string | null;
      price_cents?: number;
      deposit_cents?: number;
      is_active?: boolean;
    }
  ) {
    const prisma = getPrisma();
    return prisma.product.update({ where: { id }, data, select: PRODUCT_SELECT });
  },
};
