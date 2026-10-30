import type { NextFunction, Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { opsKpiOverviewQuerySchema } from "@xua/shared/schemas/ops-kpi";
import { kpiOverviewService } from "../services/kpi-overview.service.js";
import { parsePeriodDates } from "../../../utils/date.js";
import { badRequest } from "../../../errors/index.js";

export const kpiOverviewController = {
  /** GET /api/ops/kpis/overview — visão consolidada para o painel da OPS. */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = opsKpiOverviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
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
      next(error);
    }
  },
};
