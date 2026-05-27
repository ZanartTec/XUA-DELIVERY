import type { Request, Response } from "express";
import { logger } from "../../../infra/logger/index.js";
import {
  opsInventoryBalanceQuerySchema,
  opsInventoryMovementQuerySchema,
  opsInventoryReadIdParamSchema,
  opsInventoryReconciliationSessionQuerySchema,
  opsInventoryReconciliationQuerySchema,
} from "@xua/shared/schemas/inventory";
import { opsInventoryReadService } from "../services/inventory-read.service.js";
import { inventoryReconciliationSessionService } from "../../inventory/services/reconciliation-session.service.js";

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function parseId(req: Request, res: Response): string | null {
  const parsed = opsInventoryReadIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues[0].message);
    return null;
  }

  return parsed.data.id;
}

export const opsInventoryReadController = {
  async listBalances(req: Request, res: Response): Promise<void> {
    const parsed = opsInventoryBalanceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0].message);
      return;
    }

    try {
      res.json(await opsInventoryReadService.listBalances(parsed.data));
    } catch (error) {
      logger.error({ error }, "Error listing ops inventory balances");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async getBalance(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (!id) return;

    try {
      const result = await opsInventoryReadService.getBalance(id);
      if (!result) {
        res.status(404).json({ error: "Saldo não encontrado" });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error({ error }, "Error fetching ops inventory balance");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async listMovements(req: Request, res: Response): Promise<void> {
    const parsed = opsInventoryMovementQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0].message);
      return;
    }

    try {
      res.json(await opsInventoryReadService.listMovements(parsed.data));
    } catch (error) {
      logger.error({ error }, "Error listing ops inventory movements");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async getMovement(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (!id) return;

    try {
      const result = await opsInventoryReadService.getMovement(id);
      if (!result) {
        res.status(404).json({ error: "Movimento não encontrado" });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error({ error }, "Error fetching ops inventory movement");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async listReconciliations(req: Request, res: Response): Promise<void> {
    const parsed = opsInventoryReconciliationQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0].message);
      return;
    }

    try {
      res.json(await opsInventoryReadService.listReconciliations(parsed.data));
    } catch (error) {
      logger.error({ error }, "Error listing ops inventory reconciliations");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async getReconciliation(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (!id) return;

    try {
      const result = await opsInventoryReadService.getReconciliation(id);
      if (!result) {
        res.status(404).json({ error: "Reconciliação não encontrada" });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error({ error }, "Error fetching ops inventory reconciliation");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async listReconciliationSessions(req: Request, res: Response): Promise<void> {
    const parsed = opsInventoryReconciliationSessionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0].message);
      return;
    }

    try {
      res.json(await inventoryReconciliationSessionService.listSessionsForOps(parsed.data));
    } catch (error) {
      logger.error({ error }, "Error listing ops inventory reconciliation sessions");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  async getReconciliationSession(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (!id) return;

    try {
      const result = await inventoryReconciliationSessionService.getSessionForOps(id);
      if (!result) {
        res.status(404).json({ error: "Sessão de conciliação não encontrada" });
        return;
      }

      res.json(result);
    } catch (error) {
      logger.error({ error }, "Error fetching ops inventory reconciliation session");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};