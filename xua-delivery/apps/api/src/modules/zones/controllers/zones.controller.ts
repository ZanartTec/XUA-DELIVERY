import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { zoneSchema, coverageSchema } from "@xua/shared/schemas/zone";
import { availableDatesQuerySchema, timeSlotsQuerySchema } from "@xua/shared/schemas/schedule";
import { zonesService } from "../services/zones.service.js";
import { zonesRepository } from "../repository/zones.repository.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { timeslotRepository } from "../../distributor/repository/timeslot.repository.js";

export const zonesController = {
  // ─── Zone CRUD ────────────────────────────────────────────

  /** GET /api/zones */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const zones = await zonesService.list();
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
      const zone = await zonesService.create(parsed.data);
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
      const zone = await zonesService.update(id, parsed.data);
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
      await zonesService.remove(id);
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

      const slots = await zonesService.getCapacity(zoneId, date, endDate);
      res.json({ slots });
    } catch (error) {
      logger.error({ error }, "Error getting capacity");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** GET /api/zones/:id/available-dates?distributor_id=&days=14 */
  async getAvailableDates(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const parsed = availableDatesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      let distributorId = parsed.data.distributor_id;
      if (!distributorId) {
        distributorId = (await zonesRepository.findDistributorId(zoneId)) ?? undefined;
        if (!distributorId) {
          res.status(404).json({ error: "Zona não encontrada" });
          return;
        }
      }

      const dates = await scheduleService.getAvailableDates(
        distributorId,
        zoneId,
        parsed.data.days
      );
      res.json({ distributor_id: distributorId, dates });
    } catch (error) {
      logger.error({ error }, "Error getting available dates");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** GET /api/zones/:id/time-slots?distributor_id=&date=YYYY-MM-DD */
  async getTimeSlots(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const parsed = timeSlotsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      let distributorId = parsed.data.distributor_id;
      if (!distributorId) {
        distributorId = (await zonesRepository.findDistributorId(zoneId)) ?? undefined;
        if (!distributorId) {
          res.status(404).json({ error: "Zona não encontrada" });
          return;
        }
      }

      const slots = await timeslotRepository.findActiveByDistributor(distributorId);
      res.json({ distributor_id: distributorId, date: parsed.data.date, slots });
    } catch (error) {
      logger.error({ error }, "Error getting time slots");
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
      const coverage = await zonesService.addCoverage(zoneId, parsed.data);
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
      await zonesService.removeCoverage(coverageId, zoneId);
      res.status(204).end();
    } catch (error) {
      logger.error({ error }, "Error removing coverage");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
