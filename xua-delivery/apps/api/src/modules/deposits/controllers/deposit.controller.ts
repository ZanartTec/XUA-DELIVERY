import type { Request, Response } from "express";
import {
  depositLookupSchema,
  depositProgramUpsertSchema,
  depositProgramPatchSchema,
  depositAdjustSchema,
  depositPreviewSchema,
} from "@xua/shared/schemas/deposit";
import { logger } from "../../../infra/logger/index.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { depositProgramService, DepositProgramError } from "../services/deposit-program.service.js";
import { depositSettlementService } from "../services/deposit-settlement.service.js";

function handleError(res: Response, error: unknown, context: string): void {
  if (error instanceof DepositProgramError) {
    const status = error.code === "CONSUMER_NOT_FOUND" || error.code === "PROGRAM_NOT_FOUND" ? 404 : 400;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  logger.error({ error }, context);
  res.status(500).json({ error: "Erro interno" });
}

async function resolveOwnDistributor(req: Request, res: Response): Promise<string | null> {
  const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
  if (!distributorId) {
    res.status(403).json({ error: "Usuário não vinculado a uma distribuidora" });
    return null;
  }
  return distributorId;
}

export const depositController = {
  // ─── Distribuidora: gestão do programa ────────────────────

  /** GET /api/distributor/deposit-program/lookup?document= */
  async lookup(req: Request, res: Response): Promise<void> {
    const distributorId = await resolveOwnDistributor(req, res);
    if (!distributorId) return;

    const parsed = depositLookupSchema.safeParse({ document: req.query.document });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await depositProgramService.lookupByDocument(distributorId, parsed.data.document);
      res.json(result);
    } catch (error) {
      handleError(res, error, "Error on deposit lookup");
    }
  },

  /** GET /api/distributor/deposit-program */
  async listPrograms(req: Request, res: Response): Promise<void> {
    const distributorId = await resolveOwnDistributor(req, res);
    if (!distributorId) return;
    try {
      const programs = await depositProgramService.listPrograms(distributorId);
      res.json({ programs });
    } catch (error) {
      handleError(res, error, "Error listing deposit programs");
    }
  },

  /** POST /api/distributor/deposit-program */
  async enroll(req: Request, res: Response): Promise<void> {
    const distributorId = await resolveOwnDistributor(req, res);
    if (!distributorId) return;

    const parsed = depositProgramUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const program = await depositProgramService.enrollConsumer({
        distributorId,
        consumerId: parsed.data.consumer_id,
        maxBottles: parsed.data.max_bottles,
        notes: parsed.data.notes,
        enabledByUserId: req.user!.sub,
      });
      res.status(201).json({ program });
    } catch (error) {
      handleError(res, error, "Error enrolling deposit program");
    }
  },

  /** PATCH /api/distributor/deposit-program/:consumerId */
  async patch(req: Request, res: Response): Promise<void> {
    const distributorId = await resolveOwnDistributor(req, res);
    if (!distributorId) return;

    const parsed = depositProgramPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const program = await depositProgramService.updateProgram({
        distributorId,
        consumerId: req.params.consumerId as string,
        isEnabled: parsed.data.is_enabled,
        maxBottles: parsed.data.max_bottles,
        notes: parsed.data.notes,
        actorUserId: req.user!.sub,
      });
      res.json({ program });
    } catch (error) {
      handleError(res, error, "Error updating deposit program");
    }
  },

  /** GET /api/distributor/deposit/balances */
  async listBalances(req: Request, res: Response): Promise<void> {
    const distributorId = await resolveOwnDistributor(req, res);
    if (!distributorId) return;
    try {
      const balances = await depositProgramService.listBalancesByDistributor(distributorId);
      res.json({ balances });
    } catch (error) {
      handleError(res, error, "Error listing deposit balances");
    }
  },

  /** POST /api/distributor/deposit/:consumerId/adjust */
  async adjust(req: Request, res: Response): Promise<void> {
    const distributorId = await resolveOwnDistributor(req, res);
    if (!distributorId) return;

    const parsed = depositAdjustSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await depositProgramService.adjustBalance({
        distributorId,
        consumerId: req.params.consumerId as string,
        inventoryItemId: parsed.data.inventory_item_id,
        bottlesDelta: parsed.data.bottles_delta,
        movementType: parsed.data.movement_type,
        notes: parsed.data.notes,
        actorUserId: req.user!.sub,
      });
      res.json(result);
    } catch (error) {
      handleError(res, error, "Error adjusting deposit balance");
    }
  },

  // ─── Consumidor: saldo de vasilhames ──────────────────────

  /** POST /api/consumers/:id/deposit/preview */
  async consumerPreview(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;
    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsed = depositPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await depositSettlementService.previewForCheckout({
        distributorId: parsed.data.distributor_id,
        consumerId: id,
        items: parsed.data.items,
        emptiesByBottle: new Map(
          parsed.data.empty_bottles.map((e) => [e.bottle_product_id, e.quantity])
        ),
      });
      res.json(result);
    } catch (error) {
      handleError(res, error, "Error on deposit preview");
    }
  },

  /** GET /api/consumers/:id/deposit/balance */
  async consumerBalance(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;
    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    try {
      const result = await depositProgramService.getConsumerBalance(id);
      res.json(result);
    } catch (error) {
      handleError(res, error, "Error getting consumer deposit balance");
    }
  },
};
