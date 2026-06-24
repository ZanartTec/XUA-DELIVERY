import { Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  image_url: true,
  price_cents: true,
  deposit_cents: true,
  is_active: true,
  categories: {
    select: {
      id: true,
      name: true,
      value: true,
    },
  },
} as const;

interface FindActiveParams {
  search?: string;
  category?: string;
  page: number;
  limit: number;
}

export const productsRepository = {
  async findActive({ search, category, page, limit }: FindActiveParams) {
    const prisma = getPrisma();
    const skip = (page - 1) * limit;

    // Busca por texto usa SQL raw porque o Prisma não expõe unaccent() no
    // query builder tipado — necessário para "galao" encontrar "Galão".
    if (search) {
      const pattern = `%${search}%`;
      const categoryFilter = category
        ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM "_CategoryToProduct" ctp
            JOIN "07_mst_categories" c ON c.id = ctp."A"
            WHERE ctp."B" = p.id AND c.value = ${category}
          )`
        : Prisma.empty;

      const [rows, countRows] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM "06_mst_products" p
          WHERE p.is_active = true
            AND (
              unaccent(p.name) ILIKE unaccent(${pattern})
              OR unaccent(COALESCE(p.description, '')) ILIKE unaccent(${pattern})
            )
            ${categoryFilter}
          ORDER BY p.name ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint as count
          FROM "06_mst_products" p
          WHERE p.is_active = true
            AND (
              unaccent(p.name) ILIKE unaccent(${pattern})
              OR unaccent(COALESCE(p.description, '')) ILIKE unaccent(${pattern})
            )
            ${categoryFilter}
        `,
      ]);

      const ids = rows.map((r) => r.id);
      const products = ids.length
        ? await prisma.product.findMany({
            where: { id: { in: ids } },
            select: PRODUCT_SELECT,
            orderBy: { name: "asc" },
          })
        : [];

      return { products, total: Number(countRows[0]?.count ?? 0) };
    }

    const where = {
      is_active: true,
      ...(category ? { categories: { some: { value: category } } } : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: PRODUCT_SELECT,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },

  async findAll() {
    const prisma = getPrisma();
    return prisma.product.findMany({
      select: PRODUCT_SELECT,
      orderBy: { name: "asc" },
    });
  },

  async create(data: {
    name: string;
    description?: string | null;
    image_url?: string | null;
    price_cents: number;
    deposit_cents?: number;
  }) {
    const prisma = getPrisma();
    return prisma.product.create({ data, select: PRODUCT_SELECT });
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
