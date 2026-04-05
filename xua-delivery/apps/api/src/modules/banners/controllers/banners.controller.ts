import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { bannersService } from "../services/banners.service.js";
import type { BannerType } from "@prisma/client";

export const bannersController = {
  /** GET /api/banners — banners ativos (consumer) */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const type = req.query.type as BannerType | undefined;
      const banners = await bannersService.listActive(type);
      res.json({ banners });
    } catch (error) {
      logger.error({ error }, "Error listing banners");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** GET /api/banners/all — todos os banners (ops) */
  async listAll(_req: Request, res: Response): Promise<void> {
    try {
      const banners = await bannersService.listAll();
      res.json({ banners });
    } catch (error) {
      logger.error({ error }, "Error listing all banners");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** POST /api/banners — criar banner (ops) */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const banner = await bannersService.create(req.body);
      res.status(201).json({ banner });
    } catch (error) {
      logger.error({ error }, "Error creating banner");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** PATCH /api/banners/:id — atualizar banner (ops) */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const banner = await bannersService.update(id, req.body);
      res.json({ banner });
    } catch (error) {
      logger.error({ error }, "Error updating banner");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** DELETE /api/banners/:id — remover banner (ops) */
  async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      await bannersService.remove(id);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error removing banner");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
