import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { notificationService } from "../services/notification.service.js";
import { logger } from "../../../infra/logger/index.js";
import { badRequest } from "../../../errors/index.js";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export const notificationsController = {
  /** POST /api/notifications/subscribe */
  async subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const token = await notificationService.subscribe(
        req.user!.sub,
        parsed.data,
        req.get("user-agent") ?? null
      );
      res.status(201).json({ id: token.id });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/notifications/subscribe — logout ou "desativar notificações".
   * Só apaga token do próprio usuário: um endpoint que já foi reatribuído a
   * outra pessoa não é afetado. Idempotente (204 mesmo sem token).
   */
  async unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      await notificationService.unsubscribe(req.user!.sub, parsed.data.endpoint);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
};
