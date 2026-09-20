import type { NextFunction, Request, Response } from "express";
import { ActorType } from "@xua/shared/enums";
import {
  zoneSchema,
  zoneUpdateSchema,
  zoneTransferSchema,
  zoneOpsQuerySchema,
  zoneCoverageQuerySchema,
  coverageSchema,
  coverageBulkSchema,
} from "@xua/shared/schemas/zone";
import { availableDatesQuerySchema, timeSlotsQuerySchema } from "@xua/shared/schemas/schedule";
import { badRequest, forbidden, notFound } from "../../../errors/index.js";
import { parseOrThrow } from "../../../http/validate.js";
import { zonesService, type ZoneActor } from "../services/zones.service.js";
import { zonesRepository } from "../repository/zones.repository.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { timeslotRepository } from "../../distributor/repository/timeslot.repository.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";

function actorFrom(req: Request): ZoneActor {
  return {
    type: req.user!.role === "ops" ? ActorType.OPS : ActorType.DISTRIBUTOR_USER,
    id: req.user!.sub,
  };
}

/**
 * Ownership: `ops` gerencia qualquer zona; `distributor_admin` só as da própria
 * distribuidora. Sem isto, um distributor_admin edita zona de concorrente —
 * as rotas de escrita ficaram anos sem essa checagem.
 */
async function assertOwner(req: Request, targetDistributorId: string): Promise<void> {
  if (req.user!.role === "ops") return;

  const ownDistributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
  if (!ownDistributorId || ownDistributorId !== targetDistributorId) {
    throw forbidden();
  }
}

/** Resolve a distribuidora dona da zona; 404 se a zona não existe. */
async function resolveZoneOwner(zoneId: string): Promise<string> {
  const distributorId = await zonesRepository.findDistributorId(zoneId);
  if (!distributorId) throw notFound("Zona não encontrada");
  return distributorId;
}

/** Zona + ownership numa tacada, que é como toda rota de escrita começa. */
async function assertZoneAccess(req: Request, zoneId: string): Promise<void> {
  await assertOwner(req, await resolveZoneOwner(zoneId));
}

export const zonesController = {
  // ─── Leitura ──────────────────────────────────────────────

  /**
   * GET /api/zones — consumidor/checkout. Retorna ARRAY puro (sem wrapper) e só
   * zonas ativas. Shape legado: não alterar sem migrar os consumidores.
   */
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await zonesService.list());
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/zones/all — painel de operação: inclui zonas inativas e filtros. */
  async listForOps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let filters = parseOrThrow(zoneOpsQuerySchema, req.query);

      // Sem isto, um distributor_admin que omitisse `distributor_id` enxergaria as
      // zonas de todas as distribuidoras. Só ops vê a base inteira.
      if (req.user!.role !== "ops") {
        const ownDistributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
        if (!ownDistributorId) throw forbidden();
        filters = { ...filters, distributor_id: ownDistributorId };
      }

      res.json(await zonesService.listForOps(filters));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/zones/:id/coverage — cobertura paginada de uma zona.
   * Endpoint próprio porque uma zona sozinha pode ter milhares de linhas.
   */
  async listCoverage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    try {
      const query = parseOrThrow(zoneCoverageQuerySchema, req.query);
      await assertZoneAccess(req, zoneId);

      res.json(await zonesService.listCoverage(zoneId, query));
    } catch (error) {
      next(error);
    }
  },

  // ─── Zone CRUD ────────────────────────────────────────────

  /** POST /api/zones */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = parseOrThrow(zoneSchema, req.body);
      await assertOwner(req, input.distributor_id);

      res.status(201).json(await zonesService.create(input, actorFrom(req)));
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /api/zones/:id — nome e/ou status. Transferência tem rota própria. */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;
    try {
      const input = parseOrThrow(zoneUpdateSchema, req.body);
      await assertZoneAccess(req, id);

      res.json(await zonesService.update(id, input, actorFrom(req)));
    } catch (error) {
      next(error);
    }
  },

  /** DELETE /api/zones/:id — soft delete (is_active = false). */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;
    try {
      await assertZoneAccess(req, id);

      await zonesService.remove(id, actorFrom(req));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /api/zones/:id/transfer — muda a distribuidora dona da zona (ops). */
  async transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;
    try {
      const input = parseOrThrow(zoneTransferSchema, req.body);

      res.json(await zonesService.transfer(id, input.distributor_id, actorFrom(req)));
    } catch (error) {
      next(error);
    }
  },

  // ─── Available Dates ───────────────────────────────────────────
  async getAvailableDates(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    try {
      const query = parseOrThrow(availableDatesQuerySchema, req.query);

      let distributorId = query.distributor_id;
      let scheduleZoneId = zoneId;
      if (!distributorId) {
        distributorId = (await zonesRepository.findDistributorId(zoneId)) ?? undefined;
        if (!distributorId) throw notFound("Zona não encontrada");
      } else {
        const resolvedZoneId = await distributorRepository.resolveCoveredZone(
          distributorId,
          zoneId
        );
        if (!resolvedZoneId) throw badRequest("Distribuidora selecionada não atende esta zona");
        scheduleZoneId = resolvedZoneId;
      }

      const dates = await scheduleService.getAvailableDates(
        distributorId,
        scheduleZoneId,
        query.days
      );
      res.json({ distributor_id: distributorId, dates });
    } catch (error) {
      next(error);
    }
  },

  /** GET /api/zones/:id/time-slots?distributor_id=&date=YYYY-MM-DD */
  async getTimeSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    try {
      const query = parseOrThrow(timeSlotsQuerySchema, req.query);

      let distributorId = query.distributor_id;
      if (!distributorId) {
        distributorId = (await zonesRepository.findDistributorId(zoneId)) ?? undefined;
        if (!distributorId) throw notFound("Zona não encontrada");
      }

      const slots = await timeslotRepository.findActiveByDistributor(distributorId);
      res.json({ distributor_id: distributorId, date: query.date, slots });
    } catch (error) {
      next(error);
    }
  },

  // ─── Coverage ─────────────────────────────────────────────

  /** POST /api/zones/:id/coverage */
  async addCoverage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    try {
      const input = parseOrThrow(coverageSchema, req.body);
      await assertZoneAccess(req, zoneId);

      res.status(201).json(await zonesService.addCoverage(zoneId, input, actorFrom(req)));
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/zones/:id/coverage/bulk — import de lista colada pela Ops. */
  async addCoverageBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    try {
      const input = parseOrThrow(coverageBulkSchema, req.body);
      await assertZoneAccess(req, zoneId);

      res
        .status(201)
        .json(await zonesService.addCoverageBulk(zoneId, input.items, actorFrom(req)));
    } catch (error) {
      next(error);
    }
  },

  /** POST /api/zones/:id/coverage/preview — checa conflitos sem gravar. */
  async previewCoverage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    try {
      const input = parseOrThrow(coverageBulkSchema, req.body);
      await assertZoneAccess(req, zoneId);

      res.json(await zonesService.previewConflicts(zoneId, input.items));
    } catch (error) {
      next(error);
    }
  },

  /** DELETE /api/zones/:id/coverage?coverageId=... */
  async removeCoverage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const zoneId = req.params.id as string;
    const coverageId = req.query.coverageId as string | undefined;
    try {
      if (!coverageId) throw badRequest("coverageId obrigatório");
      await assertZoneAccess(req, zoneId);

      await zonesService.removeCoverage(coverageId, zoneId, actorFrom(req));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
};
