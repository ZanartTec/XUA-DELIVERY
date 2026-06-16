import type { NextFunction, Request, Response } from "express";
import {
  subscriptionPlanCreateSchema,
  subscriptionPlanUpdateSchema,
} from "@xua/shared/schemas/subscription-plan";
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
      if (err instanceof Error && err.message === "PLAN_NOT_FOUND") {
        res.status(404).json({ error: "Plano não encontrado" });
        return;
      }
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = subscriptionPlanCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const plan = await subscriptionPlansService.createPlan(parsed.data);
      res.status(201).json({ plan });
    } catch (err) {
      if (err instanceof Error && err.message === "DISTRIBUTOR_GATEWAY_REQUIRED") {
        res.status(400).json({
          error: "Só é possível vincular distribuidoras com gateway de pagamento (Mercado Pago) configurado.",
          code: "DISTRIBUTOR_GATEWAY_REQUIRED",
        });
        return;
      }
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = subscriptionPlanUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const id = req.params.id as string;
      const plan = await subscriptionPlansService.updatePlan(id, parsed.data);
      res.json({ plan });
    } catch (err) {
      if (err instanceof Error && err.message === "PLAN_NOT_FOUND") {
        res.status(404).json({ error: "Plano não encontrado" });
        return;
      }
      if (err instanceof Error && err.message === "DISTRIBUTOR_GATEWAY_REQUIRED") {
        res.status(400).json({
          error: "Só é possível vincular distribuidoras com gateway de pagamento (Mercado Pago) configurado.",
          code: "DISTRIBUTOR_GATEWAY_REQUIRED",
        });
        return;
      }
      next(err);
    }
  },
};
