import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { productsService } from "../services/products.service.js";

export const productsController = {
  /** GET /api/products */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const products = await productsService.listActive();
      res.json({ products });
    } catch (error) {
      logger.error({ error }, "Error listing products");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** GET /api/products/all — somente ops */
  async listAll(_req: Request, res: Response): Promise<void> {
    try {
      const products = await productsService.listAll();
      res.json({ products });
    } catch (error) {
      logger.error({ error }, "Error listing all products");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** PATCH /api/products/:id — somente ops */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { name, description, image_url, price_cents, deposit_cents, is_active } = req.body as {
        name?: string;
        description?: string | null;
        image_url?: string | null;
        price_cents?: number;
        deposit_cents?: number;
        is_active?: boolean;
      };

      const product = await productsService.update(id, {
        name,
        description,
        image_url,
        price_cents,
        deposit_cents,
        is_active,
      });
      res.json({ product });
    } catch (error) {
      logger.error({ error }, "Error updating product");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
