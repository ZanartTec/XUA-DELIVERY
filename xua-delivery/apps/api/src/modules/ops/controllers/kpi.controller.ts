import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { kpiService } from "../../distributor/services/kpi.service.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { parsePeriodDates } from "../../../utils/date.js";

export const kpiController = {
  /** GET /api/kpis */
  async get(req: Request, res: Response): Promise<void> {
    const role = req.user!.role;
    const userId = req.user!.sub;
    const period = (req.query.period as string) ?? "7d";
    const distributorId = req.query.distributorId as string | undefined;

    const { start, end } = parsePeriodDates(period);

    try {
      if (role === "distributor_admin") {
        const [sla, acceptance, redelivery] = await Promise.all([
          kpiService.slaAcceptance(userId, start, end),
          kpiService.acceptanceRate(userId, start, end),
          kpiService.redeliveryRate(userId, start, end),
        ]);

        res.json({
          kpis: {
            sla_acceptance_pct: sla.rate,
            acceptance_rate_pct: acceptance.rate,
            redelivery_rate_pct: redelivery.rate,
          },
        });
        return;
      }

      if (role === "ops") {
        if (distributorId) {
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
          return;
        }

        // Sem distributorId: retorna KPIs de todos os distribuidores ativos
        const distributors = await distributorRepository.findAllActive();

        const kpis = await Promise.all(
          distributors.map(async (d) => {
            const [sla, acceptance, redelivery] = await Promise.all([
              kpiService.slaAcceptance(d.id, start, end),
              kpiService.acceptanceRate(d.id, start, end),
              kpiService.redeliveryRate(d.id, start, end),
            ]);
            return {
              distributor_id: d.id,
              distributor_name: d.name,
              sla_acceptance_pct: sla.rate,
              acceptance_rate_pct: acceptance.rate,
              redelivery_rate_pct: redelivery.rate,
            };
          })
        );

        res.json({ kpis });
        return;
      }

      res.status(403).json({ error: "Acesso negado" });
    } catch (error) {
      logger.error({ error }, "Error fetching KPIs");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
