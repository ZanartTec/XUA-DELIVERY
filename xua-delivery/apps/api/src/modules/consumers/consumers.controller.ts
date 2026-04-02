import type { Request, Response } from "express";
import { z } from "zod";
import { getPrisma } from "../../infra/prisma/client.js";
import { fetchCep } from "../../infra/cep/viacep.js";
import { logger } from "../../infra/logger/index.js";
import { consumerRepository } from "./consumers.repository.js";
import { depositService } from "./deposit.service.js";
import { profileUpdateSchema } from "@xua/shared/schemas/consumer";
import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

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

function formatZipCode(zipCode: string): string {
  const clean = zipCode.replace(/\D/g, "");
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

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
      const consumer = await consumerRepository.findById(id);
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
      const updated = await consumerRepository.update(id, parsed.data);
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
      const preview = await depositService.getPreview(id);
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
      const prisma = getPrisma();
      const addresses = await prisma.address.findMany({
        where: { consumer_id: id },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
      });
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

    const formattedZipCode = formatZipCode(cleanZipCode);

    try {
      const prisma = getPrisma();
      const result = await prisma.$transaction(async (tx: TxClient) => {
        const coverage = await tx.zoneCoverage.findFirst({
          where: {
            zip_code: { in: [cleanZipCode, formattedZipCode] },
            zone: { is_active: true },
          },
          select: { zone_id: true },
        });

        if (!coverage) {
          return { code: "NO_COVERAGE" as const };
        }

        if (parsed.data.is_default) {
          await tx.address.updateMany({
            where: { consumer_id: id, is_default: true },
            data: { is_default: false },
          });
        }

        const address = await tx.address.create({
          data: {
            consumer_id: id,
            zip_code: formattedZipCode,
            street: parsed.data.street,
            number: parsed.data.number,
            complement: parsed.data.complement || null,
            neighborhood: parsed.data.neighborhood,
            city: parsed.data.city,
            state: parsed.data.state,
            zone_id: coverage.zone_id,
            is_default: parsed.data.is_default,
          },
        });

        return { address };
      });

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
      const data = await fetchCep(clean);
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
