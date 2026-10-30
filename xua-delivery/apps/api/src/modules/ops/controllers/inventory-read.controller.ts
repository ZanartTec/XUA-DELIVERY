import type { NextFunction, Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import {
  inventoryItemFilterSchema,
  opsInventoryBalanceQuerySchema,
  opsInventoryMovementQuerySchema,
  opsInventoryReadIdParamSchema,
  opsInventoryReconciliationSessionQuerySchema,
} from "@xua/shared/schemas/inventory";
import { opsInventoryReadService } from "../services/inventory-read.service.js";
import { inventoryReconciliationSessionService } from "../../inventory/services/reconciliation-session.service.js";
import { badRequest, notFound } from "../../../errors/index.js";

function parseId(req: Request): string {
  const parsed = opsInventoryReadIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);
  return parsed.data.id;
}

export const opsInventoryReadController = {
  async listDistributors(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await opsInventoryReadService.listDistributors());
    } catch (error) {
      next(error);
    }
  },

  async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = inventoryItemFilterSchema.safeParse(req.query);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      res.json(await opsInventoryReadService.listItems(parsed.data));
    } catch (error) {
      next(error);
    }
  },

  async listBalances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = opsInventoryBalanceQuerySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      res.json(await opsInventoryReadService.listBalances(parsed.data));
    } catch (error) {
      next(error);
    }
  },

  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req);
      const result = await opsInventoryReadService.getBalance(id);
      if (!result) {
        next(notFound("Saldo não encontrado"));
        return;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = opsInventoryMovementQuerySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      res.json(await opsInventoryReadService.listMovements(parsed.data));
    } catch (error) {
      next(error);
    }
  },

  async getMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req);
      const result = await opsInventoryReadService.getMovement(id);
      if (!result) {
        next(notFound("Movimento não encontrado"));
        return;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listReconciliationSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = opsInventoryReconciliationSessionQuerySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      res.json(await inventoryReconciliationSessionService.listSessionsForOps(parsed.data));
    } catch (error) {
      next(error);
    }
  },

  async getReconciliationSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req);
      const result = await inventoryReconciliationSessionService.getSessionForOps(id);
      if (!result) {
        next(notFound("Sessão de conciliação não encontrada"));
        return;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};