import type { NextFunction, Request, Response } from "express";
import {
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
} from "@xua/shared/schemas/product";
import { productsService } from "../services/products.service.js";

export const productsController = {
  /** GET /api/products — catálogo ativo, paginado e filtrável */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = productListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await productsService.listActive(parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/products/all — somente ops */
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await productsService.listAll();
      res.json({ products });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/products — somente ops */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = productCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const product = await productsService.create(parsed.data);
      res.status(201).json({ product });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/products/:id — somente ops */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;

    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const product = await productsService.update(id, parsed.data);
      res.json({ product });
    } catch (err) {
      next(err);
    }
  },
};
