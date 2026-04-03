import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../infra/logger/index.js";
import { consumersService } from "./consumers.service.js";
import { profileUpdateSchema } from "@xua/shared/schemas/consumer";

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
  async getProfile(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    // SEC-05: Ownership check
    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    try {
      const consumer = await consumersService.getProfile(id);
      if (!consumer) {
        res.status(404).json({ error: "Consumidor não encontrado" });
        return;
      }
      res.json(consumer);
    } catch (error) {
      logger.error({ error }, "Error getting consumer profile");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** PATCH /api/consumers/:id */
  async updateProfile(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const updated = await consumersService.updateProfile(id, parsed.data);
      res.json(updated);
    } catch (error) {
      logger.error({ error }, "Error updating consumer profile");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  // ─── Deposit Preview ─────────────────────────────────────

  /** GET /api/consumers/:id/deposit-preview */
  async depositPreview(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    try {
      const preview = await consumersService.getDepositPreview(id);
      res.json(preview);
    } catch (error) {
      logger.error({ error }, "Error getting deposit preview");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  // ─── Addresses ────────────────────────────────────────────

  /** GET /api/consumers/:id/addresses */
  async listAddresses(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    try {
      const addresses = await consumersService.listAddresses(id);
      res.json({ addresses });
    } catch (error) {
      logger.error({ error }, "Error listing addresses");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** POST /api/consumers/:id/addresses */
  async createAddress(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const id = req.params.id as string;

    if (user.sub !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsed = createAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
      return;
    }

    const cleanZipCode = parsed.data.zip_code.replace(/\D/g, "");
    if (cleanZipCode.length !== 8) {
      res.status(400).json({ error: "CEP inválido" });
      return;
    }

    try {
      const result = await consumersService.createAddress(id, parsed.data);

      if ("code" in result) {
        res.status(400).json({ error: "Ainda não atendemos sua região", code: "NO_COVERAGE" });
        return;
      }

      res.status(201).json({ address: result.address });
    } catch (error) {
      logger.error({ error }, "Error creating address");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  // ─── CEP Lookup ───────────────────────────────────────────

  /** GET /api/consumers/cep/:cep */
  async lookupCep(req: Request, res: Response): Promise<void> {
    const cep = req.params.cep as string;
    const clean = cep.replace(/\D/g, "");

    if (clean.length !== 8) {
      res.status(400).json({ error: "CEP inválido" });
      return;
    }

    try {
      const data = await consumersService.lookupCep(clean);
      if (!data) {
        res.status(404).json({ error: "CEP não encontrado" });
        return;
      }
      res.json(data);
    } catch (error) {
      logger.error({ error }, "Error looking up CEP");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
