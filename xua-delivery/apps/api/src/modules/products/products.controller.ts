import type { Request, Response } from "express";
import { getPrisma } from "../../infra/prisma/client.js";
import redis, { ensureConnected } from "../../infra/redis/client.js";
import { logger } from "../../infra/logger/index.js";

const CACHE_KEY = "products:active";
const CACHE_TTL = 300; // 5 minutos

export const productsController = {
  /** GET /api/products */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      await ensureConnected();
      const cached = await redis.get(CACHE_KEY).catch(() => null);
      if (cached) {
        res.json({ products: JSON.parse(cached) });
        return;
      }

      const prisma = getPrisma();
      const products = await prisma.product.findMany({
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          description: true,
          price_cents: true,
          deposit_cents: true,
          is_active: true,
        },
        orderBy: { name: "asc" },
      });

      redis.set(CACHE_KEY, JSON.stringify(products), "EX", CACHE_TTL).catch(() => {});

      res.json({ products });
    } catch (error) {
      logger.error({ error }, "Error listing products");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
