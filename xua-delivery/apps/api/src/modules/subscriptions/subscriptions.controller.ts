import type { Request, Response } from "express";
import { z } from "zod";
import { DeliveryWindow, SubscriptionStatus } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";
import { logger } from "../../infra/logger/index.js";
import { subscriptionService } from "./subscriptions.service.js";
import { subscriptionUpdateSchema } from "@xua/shared/schemas/order";

const createSubscriptionSchema = z.object({
  qty_20l: z.number().int().min(1),
  weekday: z.number().int().min(0).max(6),
  window: z.nativeEnum(DeliveryWindow),
});

export const subscriptionsController = {
  /** GET /api/subscriptions */
  async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();

    try {
      const subscriptions = await prisma.subscription.findMany({
        where: { consumer_id: user.sub },
        orderBy: { created_at: "desc" },
      });
      res.json(subscriptions);
    } catch (error) {
      logger.error({ error }, "Error listing subscriptions");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** POST /api/subscriptions */
  async create(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const prisma = getPrisma();

    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const subscription = await prisma.subscription.create({
        data: {
          consumer_id: user.sub,
          qty_20l: parsed.data.qty_20l,
          weekday: parsed.data.weekday,
          delivery_window: parsed.data.window,
          status: SubscriptionStatus.ACTIVE,
        },
      });
      res.status(201).json(subscription);
    } catch (error) {
      logger.error({ error }, "Error creating subscription");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** PATCH /api/subscriptions/:id */
  async update(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    const parsed = subscriptionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { action } = parsed.data;

    try {
      let result;
      switch (action) {
        case "pause":
          result = await subscriptionService.pause(id, user.sub);
          break;
        case "resume":
          result = await subscriptionService.resume(id, user.sub);
          break;
        case "cancel":
          result = await subscriptionService.cancel(id, user.sub);
          break;
      }
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro interno";

      if (msg === "SUBSCRIPTION_NOT_FOUND") {
        res.status(404).json({ error: "Assinatura não encontrada" });
        return;
      }
      if (msg === "FORBIDDEN") {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }
      if (msg === "INVALID_STATUS" || msg === "ALREADY_CANCELLED") {
        res.status(409).json({ error: "Ação não permitida no estado atual" });
        return;
      }

      logger.error({ error }, "Error updating subscription");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
