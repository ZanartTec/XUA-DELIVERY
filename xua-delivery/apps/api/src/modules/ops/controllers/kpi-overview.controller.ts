import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { opsKpiOverviewQuerySchema } from "@xua/shared/schemas/ops-kpi";
import { kpiOverviewService } from "../services/kpi-overview.service.js";
import { parsePeriodDates } from "../../../utils/date.js";

export const kpiOverviewController = {
  /** GET /api/ops/kpis/overview — visão consolidada para o painel da OPS. */
  async get(req: Request, res: Response): Promise<void> {
    const parsed = opsKpiOverviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { period, distributorId } = parsed.data;
    const { start, end } = parsePeriodDates(period);

    try {
      const overview = await kpiOverviewService.getOverview(
        start,
        end,
        distributorId
      );
      res.json(overview);
    } catch (error) {
      logger.error({ error, period, distributorId }, "Error fetching KPI overview");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
