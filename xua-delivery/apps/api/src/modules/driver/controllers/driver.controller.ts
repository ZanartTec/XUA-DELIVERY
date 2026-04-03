import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { driverService } from "../services/driver.service.js";

/**
 * DriverController — handlers HTTP para rotas do motorista.
 */
export const driverController = {
  /** GET /api/driver/deliveries */
  async listDeliveries(req: Request, res: Response): Promise<void> {
    try {
      const mapped = await driverService.listDeliveries(req.user!.sub);
      res.json(mapped);
    } catch (error) {
      logger.error({ error }, "Error listing deliveries");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** GET /api/driver/deliveries/pending */
  async listPendingDeliveries(req: Request, res: Response): Promise<void> {
    try {
      const mapped = await driverService.listPendingDeliveries(req.user!.sub);
      res.json(mapped);
    } catch (error) {
      logger.error({ error }, "Error listing pending deliveries");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** GET /api/driver/deliveries/history */
  async listDeliveryHistory(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const result = await driverService.listDeliveryHistory(
        req.user!.sub,
        limit,
        offset
      );
      res.json(result);
    } catch (error) {
      logger.error({ error }, "Error listing delivery history");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
