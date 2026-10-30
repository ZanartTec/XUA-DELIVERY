import type { NextFunction, Request, Response } from "express";
import {
  depositLookupSchema,
  depositProgramUpsertSchema,
  depositProgramPatchSchema,
  depositAdjustSchema,
  depositPreviewSchema,
} from "@xua/shared/schemas/deposit";
import { badRequest, forbidden } from "../../../errors/index.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { depositProgramService } from "../services/deposit-program.service.js";
import { depositSettlementService } from "../services/deposit-settlement.service.js";

async function resolveOwnDistributor(req: Request): Promise<string> {
  const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
  if (!distributorId) throw forbidden("Usuário não vinculado a uma distribuidora");
  return distributorId;
}

export const depositController = {
  // ─── Distribuidora: gestão do programa ────────────────────

  /** GET /api/distributor/deposit-program/lookup?document= */
  async lookup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await resolveOwnDistributor(req);
      const parsed = depositLookupSchema.safeParse({ document: req.query.document });
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const result = await depositProgramService.lookupByDocument(distributorId, parsed.data.document);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/distributor/deposit-program */
  async listPrograms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await resolveOwnDistributor(req);
      const programs = await depositProgramService.listPrograms(distributorId);
      res.json({ programs });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/distributor/deposit-program */
  async enroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await resolveOwnDistributor(req);
      const parsed = depositProgramUpsertSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

      const program = await depositProgramService.enrollConsumer({
        distributorId,
        consumerId: parsed.data.consumer_id,
        maxBottles: parsed.data.max_bottles,
        notes: parsed.data.notes,
        enabledByUserId: req.user!.sub,
      });
      res.status(201).json({ program });
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /api/distributor/deposit-program/:consumerId */
  async patch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await resolveOwnDistributor(req);
      const parsed = depositProgramPatchSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

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
      next(error);
    }
  },

  /** GET /api/distributor/deposit/balances */
  async listBalances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await resolveOwnDistributor(req);
      const balances = await depositProgramService.listBalancesByDistributor(distributorId);
      res.json({ balances });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/distributor/deposit/:consumerId/adjust */
  async adjust(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await resolveOwnDistributor(req);
      const parsed = depositAdjustSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

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
      next(error);
    }
  },

  // ─── Consumidor: saldo de vasilhames ──────────────────────

  /** POST /api/consumers/:id/deposit/preview */
  async consumerPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;
    try {
      if (user.sub !== id) throw forbidden();
      const parsed = depositPreviewSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);

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
      next(error);
    }
  },

  /** GET /api/consumers/:id/deposit/balance */
  async consumerBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;
    try {
      if (user.sub !== id) throw forbidden();
      const result = await depositProgramService.getConsumerBalance(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
