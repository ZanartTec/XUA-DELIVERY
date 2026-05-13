import type { NextFunction, Request, Response } from "express";
import {
  bannerCreateSchema,
  bannerTypeSchema,
  bannerUpdateSchema,
} from "@xua/shared/schemas/banner";
import { bannersService } from "../services/banners.service.js";

export const bannersController = {
  /** GET /api/banners — banners ativos (consumer) */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    let type: ReturnType<typeof bannerTypeSchema.parse> | undefined;
    if (req.query.type !== undefined) {
      const parsedType = bannerTypeSchema.safeParse(req.query.type);
      if (!parsedType.success) {
        res.status(400).json({ error: parsedType.error.issues[0].message });
        return;
      }
      type = parsedType.data;
    }

    try {
      const banners = await bannersService.listActive(type);
      res.json({ banners });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/banners/all — todos os banners (ops) */
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const banners = await bannersService.listAll();
      res.json({ banners });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/banners — criar banner (ops) */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = bannerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const banner = await bannersService.create(parsed.data);
      res.status(201).json({ banner });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/banners/:id — atualizar banner (ops) */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;

    const parsed = bannerUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const banner = await bannersService.update(id, parsed.data);
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  },

  /** DELETE /api/banners/:id — remover banner (ops) */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;

    try {
      await bannersService.remove(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
