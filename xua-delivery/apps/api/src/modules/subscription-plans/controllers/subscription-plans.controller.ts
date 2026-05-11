import type { Request, Response } from "express";
import { subscriptionPlansService } from "../services/subscription-plans.service.js";

export const subscriptionPlansController = {
  async list(req: Request, res: Response): Promise<void> {
    const activeOnly = req.query.activeOnly !== "false";
    const plans = await subscriptionPlansService.listPlans(activeOnly);
    res.json({ plans });
  },

  async getOne(req: Request, res: Response): Promise<void> {
    try {
      const plan = await subscriptionPlansService.getPlan(req.params.id);
      res.json(plan);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "PLAN_NOT_FOUND") {
        res.status(404).json({ error: "Plano não encontrado" });
        return;
      }
      throw err;
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    const {
      name,
      description,
      product_id,
      quantity,
      discount_percentage,
      unit_price_with_discount_cents,
      valid_from,
      valid_until,
      distributor_ids,
    } = req.body as {
      name: string;
      description?: string;
      product_id: string;
      quantity: number;
      discount_percentage?: number;
      unit_price_with_discount_cents: number;
      valid_from: string;
      valid_until: string;
      distributor_ids: string[];
    };

    if (
      !name ||
      !product_id ||
      !quantity ||
      !unit_price_with_discount_cents ||
      !valid_from ||
      !valid_until ||
      !distributor_ids?.length
    ) {
      res.status(400).json({ error: "Campos obrigatórios ausentes" });
      return;
    }

    const plan = await subscriptionPlansService.createPlan({
      name,
      description,
      product_id,
      quantity,
      discount_percentage,
      unit_price_with_discount_cents,
      valid_from,
      valid_until,
      distributor_ids,
    });
    res.status(201).json({ plan });
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const plan = await subscriptionPlansService.updatePlan(req.params.id, req.body);
      res.json({ plan });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "PLAN_NOT_FOUND") {
        res.status(404).json({ error: "Plano não encontrado" });
        return;
      }
      throw err;
    }
  },
};
