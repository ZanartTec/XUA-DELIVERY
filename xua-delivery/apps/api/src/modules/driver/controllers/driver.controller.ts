import type { NextFunction, Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import { driverService } from "../services/driver.service.js";
import { badRequest } from "../../../errors/index.js";

/**
 * DriverController — handlers HTTP para rotas do motorista.
 */
export const driverController = {
  /** GET /api/driver/deliveries */
  async listDeliveries(req: Request, res: Response, next: NextFunction): Promise<void> {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : undefined;

    if (dateParam && Number.isNaN(date?.getTime())) {
      next(badRequest("Data inválida. Use yyyy-mm-dd."));
      return;
    }

    try {
      const mapped = await driverService.listDeliveries(req.user!.sub, date);
      res.json({ deliveries: mapped });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/driver/deliveries/pending */
  async listPendingDeliveries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mapped = await driverService.listPendingDeliveries(req.user!.sub);
      res.json(mapped);
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/driver/deliveries/history */
  async listDeliveryHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      next(error);
    }
  },
};
