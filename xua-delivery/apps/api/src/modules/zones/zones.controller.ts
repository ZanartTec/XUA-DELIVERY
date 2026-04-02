import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";
import { logger } from "../../infra/logger/index.js";
import { zoneSchema, coverageSchema } from "@xua/shared/schemas/zone";
import { capacityService } from "../distributor/capacity.service.js";

type TxClient = Prisma.TransactionClient;

export const zonesController = {
  // ─── Zone CRUD ────────────────────────────────────────────

  /** GET /api/zones */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const prisma = getPrisma();
      const zones = await prisma.zone.findMany({
        where: { is_active: true },
        include: { coverage: true },
        orderBy: { name: "asc" },
      });
      res.json(zones);
    } catch (error) {
      logger.error({ error }, "Error listing zones");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** POST /api/zones */
  async create(req: Request, res: Response): Promise<void> {
    const parsed = zoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const prisma = getPrisma();
      const zone = await prisma.zone.create({ data: parsed.data });
      res.status(201).json(zone);
    } catch (error) {
      logger.error({ error }, "Error creating zone");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** PATCH /api/zones/:id */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const parsed = zoneSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const prisma = getPrisma();
      const zone = await prisma.zone.update({
        where: { id },
        data: parsed.data,
      });
      res.json(zone);
    } catch (error) {
      logger.error({ error }, "Error updating zone");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** DELETE /api/zones/:id — soft delete via is_active */
  async remove(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    try {
      const prisma = getPrisma();
      await prisma.zone.update({
        where: { id },
        data: { is_active: false },
      });
      res.status(204).end();
    } catch (error) {
      logger.error({ error }, "Error deleting zone");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  // ─── Capacity ─────────────────────────────────────────────

  /** GET /api/zones/:id/capacity?date=YYYY-MM-DD */
  async getCapacity(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const date = req.query.date as string | undefined;

    if (!date) {
      res.status(400).json({ error: "Parâmetro date é obrigatório" });
      return;
    }

    try {
      const endDate = new Date(new Date(date).getTime() + 7 * 86400000)
        .toISOString()
        .slice(0, 10);

      const slots = await capacityService.checkAvailability(zoneId, date, endDate);
      res.json({ slots });
    } catch (error) {
      logger.error({ error }, "Error getting capacity");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  // ─── Coverage ─────────────────────────────────────────────

  /** POST /api/zones/:id/coverage */
  async addCoverage(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;

    const parsed = coverageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const prisma = getPrisma();
      const coverage = await prisma.zoneCoverage.create({
        data: {
          zone_id: zoneId,
          neighborhood: parsed.data.neighborhood,
          zip_code: parsed.data.zip_code,
        },
      });
      res.status(201).json(coverage);
    } catch (error) {
      logger.error({ error }, "Error adding coverage");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** DELETE /api/zones/:id/coverage?coverageId=... */
  async removeCoverage(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const coverageId = req.query.coverageId as string | undefined;

    if (!coverageId) {
      res.status(400).json({ error: "coverageId obrigatório" });
      return;
    }

    try {
      const prisma = getPrisma();
      await prisma.zoneCoverage.delete({
        where: { id: coverageId, zone_id: zoneId },
      });
      res.status(204).end();
    } catch (error) {
      logger.error({ error }, "Error removing coverage");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
