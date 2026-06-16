import type { NextFunction, Request, Response } from "express";
import {
  userSubscriptionCreateSchema,
  userSubscriptionDeliveryDateEditSchema,
  userSubscriptionPaymentRetrySchema,
} from "@xua/shared/schemas/user-subscription";
import {
  userSubscriptionsService,
  UserSubscriptionError,
} from "../services/user-subscriptions.service.js";

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  PLAN_INACTIVE: 400,
  DISTRIBUTOR_NOT_IN_PLAN: 400,
  GATEWAY_NOT_CONFIGURED: 400,
  QUANTITY_MISMATCH: 400,
  DATE_OUT_OF_RANGE: 400,
  ADDRESS_NOT_FOUND: 404,
  ADDRESS_WITHOUT_ZONE: 400,
  DISTRIBUTOR_NOT_COVERING_ZONE: 400,
  TIME_SLOT_UNAVAILABLE: 400,
  DATE_UNAVAILABLE: 422,
  PROVIDER_REDIRECT_MISSING: 502,
  PAYMENT_METHOD_REQUIRED: 400,
  INVALID_STATUS: 409,
  DELIVERY_DATE_NOT_FOUND: 404,
  NOT_EDITABLE: 409,
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

  async resumePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = userSubscriptionPaymentRetrySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const result = await userSubscriptionsService.resumePayment(
        id,
        consumerId,
        parsed.data.payment_method
      );
      res.json(result);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.cancel(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async pause(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.pause(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async resume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const consumerId = req.user!.sub;
      const id = req.params.id as string;
      const sub = await userSubscriptionsService.resume(id, consumerId);
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },

  async editDeliveryDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = userSubscriptionDeliveryDateEditSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const consumerId = req.user!.sub;
      const sub = await userSubscriptionsService.editDeliveryDate(
        req.params.id as string,
        req.params.deliveryDateId as string,
        consumerId,
        parsed.data
      );
      res.json(sub);
    } catch (err) {
      handleDomainError(err, res, next);
    }
  },
};
