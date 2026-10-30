import type { NextFunction, Request, Response } from "express";
import {
  subscriptionPlanCreateSchema,
  subscriptionPlanUpdateSchema,
} from "@xua/shared/schemas/subscription-plan";
import { badRequest } from "../../../errors/index.js";
import { subscriptionPlansService } from "../services/subscription-plans.service.js";

export const subscriptionPlansController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activeOnly = req.query.activeOnly !== "false";
      const plans = await subscriptionPlansService.listPlans(activeOnly);
      res.json({ plans });
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const plan = await subscriptionPlansService.getPlan(id);
      res.json(plan);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = subscriptionPlanCreateSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const plan = await subscriptionPlansService.createPlan(parsed.data);
      res.status(201).json({ plan });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = subscriptionPlanUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const id = req.params.id as string;
      const plan = await subscriptionPlansService.updatePlan(id, parsed.data);
      res.json({ plan });
    } catch (err) {
      next(err);
    }
  },
};
