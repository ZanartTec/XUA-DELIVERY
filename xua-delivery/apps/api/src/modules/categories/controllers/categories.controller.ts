import type { NextFunction, Request, Response } from "express";
import { categoriesService } from "../services/categories.service.js";

export const categoriesController = {
  /** GET /api/categories — lista todas as categorias */
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await categoriesService.listAll();
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  },
};
