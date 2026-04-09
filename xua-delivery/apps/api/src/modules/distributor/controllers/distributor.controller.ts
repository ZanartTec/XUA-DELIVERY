import type { Request, Response } from "express";
import { kpiService } from "../services/kpi.service.js";
import { capacityService } from "../services/capacity.service.js";
import { distributorRepository } from "../repository/distributor.repository.js";
import { parsePeriodDates } from "../../../utils/date.js";
import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("distributor");

export const distributorController = {
  /**
   * GET /api/distributor/kpis?period=7d
   * Retorna KPIs do distribuidor autenticado.
   */
  async getKpis(req: Request, res: Response): Promise<void> {
    const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
    if (!distributorId) {
      res.status(403).json({ error: "Usuário não vinculado a nenhuma distribuidora" });
      return;
    }
    const period = (req.query.period as string) ?? "7d";
    const { start, end } = parsePeriodDates(period);

    try {
      const [sla, acceptance, redelivery] = await Promise.all([
        kpiService.slaAcceptance(distributorId, start, end),
        kpiService.acceptanceRate(distributorId, start, end),
        kpiService.redeliveryRate(distributorId, start, end),
      ]);

      res.json({
        kpis: {
          sla_acceptance_pct: sla.rate,
          acceptance_rate_pct: acceptance.rate,
          redelivery_rate_pct: redelivery.rate,
        },
      });
    } catch (err) {
      log.error({ err, distributorId }, "Erro ao buscar KPIs do distribuidor");
      throw err;
    }
  },

  /**
   * GET /api/distributor/drivers
   * Retorna lista de motoristas disponíveis para despacho.
   */
  async getDrivers(req: Request, res: Response): Promise<void> {
    try {
      const drivers = await distributorRepository.findAllDrivers();
      res.json({ drivers });
    } catch (err) {
      log.error({ err }, "Erro ao buscar motoristas");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/distributor/capacity?zoneId=&start=&end=
   * Retorna slots de capacidade disponíveis em uma zone/período.
   */
  async getCapacity(req: Request, res: Response): Promise<void> {
    const { zoneId, start, end } = req.query as {
      zoneId: string;
      start: string;
      end: string;
    };

    if (!zoneId || !start || !end) {
      res.status(400).json({ error: "Parâmetros obrigatórios: zoneId, start, end" });
      return;
    }

    try {
      const slots = await capacityService.checkAvailability(zoneId, start, end);
      res.json({ slots });
    } catch (err) {
      log.error({ err, zoneId }, "Erro ao buscar capacidade");
      throw err;
    }
  },
};
