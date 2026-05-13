import type { Request, Response } from "express";
import {
  userSubscriptionsService,
  UserSubscriptionError,
} from "../services/user-subscriptions.service.js";

function handleError(err: unknown, res: Response): void {
  if (err instanceof UserSubscriptionError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      PLAN_INACTIVE: 400,
      DISTRIBUTOR_NOT_IN_PLAN: 400,
      QUANTITY_MISMATCH: 400,
      DATE_OUT_OF_RANGE: 400,
      INVALID_STATUS: 409,
    };
    const status = statusMap[err.code] ?? 400;
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }
  throw err;
}

export const userSubscriptionsController = {
  async list(req: Request, res: Response): Promise<void> {
    const consumerId = req.user!.sub;
    const subs = await userSubscriptionsService.listByConsumer(consumerId);
    res.json(subs);
  },

  async getOne(req: Request, res: Response): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.getById(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleError(err, res);
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const { plan_id, distributor_id, address_id, delivery_dates } = req.body as {
        plan_id: string;
        distributor_id: string;
        address_id: string;
        delivery_dates: Array<{ date: string; time_slot_id: string; quantity: number }>;
      };

      if (!plan_id || !distributor_id || !address_id || !delivery_dates?.length) {
        res.status(400).json({ error: "Campos obrigatórios ausentes" });
        return;
      }

      const sub = await userSubscriptionsService.create({
        consumer_id: consumerId,
        plan_id,
        distributor_id,
        address_id,
        delivery_dates,
      });
      res.status(201).json(sub);
    } catch (err) {
      handleError(err, res);
    }
  },

  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.cancel(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleError(err, res);
    }
  },

  async pause(req: Request, res: Response): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.pause(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleError(err, res);
    }
  },

  async resume(req: Request, res: Response): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.resume(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleError(err, res);
    }
  },
};
