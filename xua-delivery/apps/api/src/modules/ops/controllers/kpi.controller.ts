import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { kpiService } from "../../distributor/services/kpi.service.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { parsePeriodDates } from "../../../utils/date.js";

export const kpiController = {
  /** GET /api/kpis */
  async get(req: Request, res: Response): Promise<void> {
    const { role } = req.user!;
    const period = (req.query.period as string) ?? "7d";
    const distributorIdQuery = req.query.distributorId as string | undefined;

    const { start, end } = parsePeriodDates(period);

    try {
      if (role === "distributor_admin") {
        // distributor_id vem do JWT (embutido no login após refactor de autenticação)
        const distId = req.user!.distributor_id!;

        const [sla, acceptance, redelivery, series] = await Promise.all([
          kpiService.slaAcceptance(distId, start, end),
          kpiService.acceptanceRate(distId, start, end),
          kpiService.redeliveryRate(distId, start, end),
          kpiService.getDailySeries(distId, start, end),
        ]);

        res.json({
          kpis: {
            sla_acceptance_pct: sla.rate,
            acceptance_rate_pct: acceptance.rate,
            redelivery_rate_pct: redelivery.rate,
            series,
          },
        });
        return;
      }

      if (role === "ops") {
        if (distributorIdQuery) {
          const [sla, acceptance, redelivery, series] = await Promise.all([
            kpiService.slaAcceptance(distributorIdQuery, start, end),
            kpiService.acceptanceRate(distributorIdQuery, start, end),
            kpiService.redeliveryRate(distributorIdQuery, start, end),
            kpiService.getDailySeries(distributorIdQuery, start, end),
          ]);

          res.json({
            kpis: {
              sla_acceptance_pct: sla.rate,
              acceptance_rate_pct: acceptance.rate,
              redelivery_rate_pct: redelivery.rate,
              series,
            },
          });
          return;
        }

        // Sem distributorId: retorna KPIs agregados de todos os distribuidores ativos
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
