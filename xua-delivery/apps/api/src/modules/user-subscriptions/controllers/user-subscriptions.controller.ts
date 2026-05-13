import type { NextFunction, Request, Response } from "express";
import { userSubscriptionCreateSchema } from "@xua/shared/schemas/user-subscription";
import {
  userSubscriptionsService,
  UserSubscriptionError,
} from "../services/user-subscriptions.service.js";

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  PLAN_INACTIVE: 400,
  DISTRIBUTOR_NOT_IN_PLAN: 400,
  QUANTITY_MISMATCH: 400,
  DATE_OUT_OF_RANGE: 400,
  INVALID_STATUS: 409,
};

function handleDomainError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof UserSubscriptionError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }
  next(err);
}

export const userSubscriptionsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const subs = await userSubscriptionsService.listByConsumer(consumerId);
      res.json(subs);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.getById(req.params.id as string, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = userSubscriptionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.create({
        consumer_id: consumerId,
        ...parsed.data,
      });
      res.status(201).json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.cancel(req.params.id as string, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async pause(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.pause(req.params.id as string, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async resume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.resume(req.params.id as string, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },
};
