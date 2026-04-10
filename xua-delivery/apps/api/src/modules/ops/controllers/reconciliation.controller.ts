import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { reconciliationSchema } from "@xua/shared/schemas/order";
import { reconciliationService } from "../services/reconciliation.service.js";

export const reconciliationController = {
  /** GET /api/reconciliations — resumo do dia para o distribuidor */
  async get(req: Request, res: Response): Promise<void> {
    const distributorId = req.user!.distributor_id!;
    const date =
      (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

    try {
      const result = await reconciliationService.getSummary(distributorId, date);
      res.json(result);
    } catch (error) {
      logger.error({ error }, "Error fetching reconciliation");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** POST /api/reconciliations — fecha reconciliação diária */
  async close(req: Request, res: Response): Promise<void> {
    const parsed = reconciliationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const distributorId = req.user!.distributor_id!;
    const date =
      (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

    try {
      await reconciliationService.close(
        parsed.data.items,
        req.user!.sub,
        distributorId,
        date,
        parsed.data.justification
      );
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "JUSTIFICATION_REQUIRED") {
        res.status(400).json({ error: "Justificativa obrigatória quando o delta do dia for maior que zero." });
        return;
      }
      logger.error({ error }, "Error closing reconciliation");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
