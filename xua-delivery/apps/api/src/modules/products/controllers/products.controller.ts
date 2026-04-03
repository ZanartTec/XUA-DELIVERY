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
};
