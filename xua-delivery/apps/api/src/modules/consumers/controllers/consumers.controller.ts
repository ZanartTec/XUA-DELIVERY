import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../../infra/logger/index.js";
import { consumersService } from "../services/consumers.service.js";
import { profileUpdateSchema, updateAssignModeSchema } from "@xua/shared/schemas/consumer";
import { AppError, badRequest, forbidden, notFound } from "../../../errors/index.js";

const createAddressSchema = z.object({
  zip_code: z.string().trim().min(1, "CEP é obrigatório"),
  street: z.string().trim().min(1, "Rua é obrigatória"),
  number: z.string().trim().min(1, "Número é obrigatório"),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1, "Bairro é obrigatório"),
  city: z.string().trim().min(1, "Cidade é obrigatória"),
  state: z.string().trim().min(1, "Estado é obrigatório"),
  is_default: z.boolean().optional().default(false),
});

export const consumersController = {
  // ─── Profile ──────────────────────────────────────────────

  /** GET /api/consumers/:id */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    // SEC-05: Ownership check
    if (user.sub !== id) {
      next(forbidden("Acesso negado"));
      return;
    }

    try {
      const consumer = await consumersService.getProfile(id);
      if (!consumer) {
        next(notFound("Consumidor não encontrado"));
        return;
      }
      res.json(consumer);
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /api/consumers/:id */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      next(forbidden("Acesso negado"));
      return;
    }

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const updated = await consumersService.updateProfile(id, parsed.data);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  // ─── Assign Mode ──────────────────────────────────────────

  /** PATCH /api/consumers/:id/assign-mode */
  async updateAssignMode(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      next(forbidden("Acesso negado"));
      return;
    }

    const parsed = updateAssignModeSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const updated = await consumersService.updateProfile(id, parsed.data);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  // ─── Addresses ────────────────────────────────────────────

  /** GET /api/consumers/:id/addresses */
  async listAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      next(forbidden("Acesso negado"));
      return;
    }

    try {
      const addresses = await consumersService.listAddresses(id);
      res.json({ addresses });
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/consumers/:id/addresses */
  async createAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      next(forbidden("Acesso negado"));
      return;
    }

    const parsed = createAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos"));
      return;
    }

    const cleanZipCode = parsed.data.zip_code.replace(/\D/g, "");
    if (cleanZipCode.length !== 8) {
      next(badRequest("CEP inválido"));
      return;
    }

    try {
      const result = await consumersService.createAddress(id, parsed.data);

      if ("code" in result) {
        // code consumido pelo address-sheet do app do consumidor.
        next(new AppError("NO_COVERAGE", "Ainda não atendemos sua região", { status: 400 }));
        return;
      }

      res.status(201).json({ address: result.address });
    } catch (error) {
      next(error);
    }
  },

  // ─── CEP Lookup ───────────────────────────────────────────

  /** GET /api/consumers/cep/:cep */
  async lookupCep(req: Request, res: Response, next: NextFunction): Promise<void> {
    const cep = req.params.cep as string;
    const clean = cep.replace(/\D/g, "");

    if (clean.length !== 8) {
      next(badRequest("CEP inválido"));
      return;
    }

    try {
      const data = await consumersService.lookupCep(clean);
      if (!data) {
        next(notFound("CEP não encontrado"));
        return;
      }
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
};
