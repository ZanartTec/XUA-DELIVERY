import type { NextFunction, Request, Response } from "express";
import { badRequest } from "../../../errors/index.js";
import {
  userSubscriptionCreateSchema,
  userSubscriptionDeliveryDateEditSchema,
  userSubscriptionPaymentRetrySchema,
} from "@xua/shared/schemas/user-subscription";
import { userSubscriptionsService } from "../services/user-subscriptions.service.js";

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
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = userSubscriptionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.create({
        consumer_id: consumerId,
        ...parsed.data,
      });
      res.status(201).json(sub);
    } catch (err) {
      next(err);
    }
  },

  async resumePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = userSubscriptionPaymentRetrySchema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const result = await userSubscriptionsService.resumePayment(
        id,
        consumerId,
        parsed.data.payment_method
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async pause(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.pause(id, consumerId);
      res.json(sub);
    } catch (err) {
      next(err);
    }
  },

  async resume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.resume(id, consumerId);
      res.json(sub);
    } catch (err) {
      next(err);
    }
  },

  async editDeliveryDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = userSubscriptionDeliveryDateEditSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.editDeliveryDate(
        req.params.id as string,
        req.params.deliveryDateId as string,
        consumerId,
        parsed.data
      );
      res.json(sub);
    } catch (err) {
      next(err);
    }
  },
};
