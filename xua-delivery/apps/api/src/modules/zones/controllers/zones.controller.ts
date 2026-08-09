import type { Request, Response } from "express";
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
import { createLogger } from "../../../infra/logger/index.js";
import { zonesService, ZoneServiceError, type ZoneActor } from "../services/zones.service.js";
import { zonesRepository } from "../repository/zones.repository.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { timeslotRepository } from "../../distributor/repository/timeslot.repository.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";

const log = createLogger("zones");

/** code de domínio → status HTTP, seguindo a convenção dos demais módulos. */
const ERROR_STATUS: Record<string, number> = {
  ZONE_NOT_FOUND: 404,
  DISTRIBUTOR_NOT_FOUND: 404,
  DISTRIBUTOR_INACTIVE: 409,
  DUPLICATE_ZONE_NAME: 409,
  COVERAGE_CONFLICT: 409,
  ZONE_HAS_OPEN_ORDERS: 409,
  SAME_DISTRIBUTOR: 400,
};

function handleError(error: unknown, res: Response, context: Record<string, unknown>): void {
  if (error instanceof ZoneServiceError) {
    res.status(ERROR_STATUS[error.code] ?? 400).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  log.error({ err: error, ...context }, "Erro no módulo de zonas");
  res.status(500).json({ error: "Erro interno" });
}

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
async function denyIfNotOwner(
  req: Request,
  res: Response,
  targetDistributorId: string
): Promise<boolean> {
  if (req.user!.role === "ops") return false;

  const ownDistributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
  if (!ownDistributorId || ownDistributorId !== targetDistributorId) {
    res.status(403).json({ error: "Acesso negado" });
    return true;
  }
  return false;
}

/** Resolve a distribuidora dona da zona; responde 404 se a zona não existe. */
async function resolveZoneOwner(zoneId: string, res: Response): Promise<string | null> {
  const distributorId = await zonesRepository.findDistributorId(zoneId);
  if (!distributorId) {
    res.status(404).json({ error: "Zona não encontrada" });
    return null;
  }
  return distributorId;
}

export const zonesController = {
  // ─── Leitura ──────────────────────────────────────────────

  /**
   * GET /api/zones — consumidor/checkout. Retorna ARRAY puro (sem wrapper) e só
   * zonas ativas. Shape legado: não alterar sem migrar os consumidores.
   */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const zones = await zonesService.list();
      res.json(zones);
    } catch (error) {
      handleError(error, res, {});
    }
  },

  /** GET /api/zones/all — painel de operação: inclui zonas inativas e filtros. */
  async listForOps(req: Request, res: Response): Promise<void> {
    const parsed = zoneOpsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    // Sem isto, um distributor_admin que omitisse `distributor_id` enxergaria as
    // zonas de todas as distribuidoras. Só ops vê a base inteira.
    let filters = parsed.data;
    if (req.user!.role !== "ops") {
      const ownDistributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (!ownDistributorId) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }
      filters = { ...filters, distributor_id: ownDistributorId };
    }

    try {
      res.json(await zonesService.listForOps(filters));
    } catch (error) {
      handleError(error, res, { query: filters });
    }
  },

  /**
   * GET /api/zones/:id/coverage — cobertura paginada de uma zona.
   * Endpoint próprio porque uma zona sozinha pode ter milhares de linhas.
   */
  async listCoverage(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;

    const parsed = zoneCoverageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    const ownerId = await resolveZoneOwner(zoneId, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      res.json(await zonesService.listCoverage(zoneId, parsed.data));
    } catch (error) {
      handleError(error, res, { zoneId });
    }
  },

  // ─── Zone CRUD ────────────────────────────────────────────

  /** POST /api/zones */
  async create(req: Request, res: Response): Promise<void> {
    const parsed = zoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    if (await denyIfNotOwner(req, res, parsed.data.distributor_id)) return;

    try {
      const zone = await zonesService.create(parsed.data, actorFrom(req));
      res.status(201).json(zone);
    } catch (error) {
      handleError(error, res, { distributorId: parsed.data.distributor_id });
    }
  },

  /** PATCH /api/zones/:id — nome e/ou status. Transferência tem rota própria. */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const parsed = zoneUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    const ownerId = await resolveZoneOwner(id, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      const result = await zonesService.update(id, parsed.data, actorFrom(req));
      res.json(result);
    } catch (error) {
      handleError(error, res, { zoneId: id });
    }
  },

  /** DELETE /api/zones/:id — soft delete (is_active = false). */
  async remove(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const ownerId = await resolveZoneOwner(id, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      await zonesService.remove(id, actorFrom(req));
      res.status(204).end();
    } catch (error) {
      handleError(error, res, { zoneId: id });
    }
  },

  /** PATCH /api/zones/:id/transfer — muda a distribuidora dona da zona (ops). */
  async transfer(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const parsed = zoneTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    try {
      const zone = await zonesService.transfer(id, parsed.data.distributor_id, actorFrom(req));
      res.json(zone);
    } catch (error) {
      handleError(error, res, { zoneId: id, target: parsed.data.distributor_id });
    }
  },

  // ─── Available Dates ───────────────────────────────────────────
  async getAvailableDates(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const parsed = availableDatesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    try {
      let distributorId = parsed.data.distributor_id;
      let scheduleZoneId = zoneId;
      if (!distributorId) {
        distributorId = (await zonesRepository.findDistributorId(zoneId)) ?? undefined;
        if (!distributorId) {
          res.status(404).json({ error: "Zona não encontrada" });
          return;
        }
      } else {
        const resolvedZoneId = await distributorRepository.resolveCoveredZone(
          distributorId,
          zoneId
        );
        if (!resolvedZoneId) {
          res.status(400).json({ error: "Distribuidora selecionada não atende esta zona" });
          return;
        }
        scheduleZoneId = resolvedZoneId;
      }

      const dates = await scheduleService.getAvailableDates(
        distributorId,
        scheduleZoneId,
        parsed.data.days
      );
      res.json({ distributor_id: distributorId, dates });
    } catch (error) {
      handleError(error, res, { zoneId });
    }
  },

  /** GET /api/zones/:id/time-slots?distributor_id=&date=YYYY-MM-DD */
  async getTimeSlots(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const parsed = timeSlotsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    try {
      let distributorId = parsed.data.distributor_id;
      if (!distributorId) {
        distributorId = (await zonesRepository.findDistributorId(zoneId)) ?? undefined;
        if (!distributorId) {
          res.status(404).json({ error: "Zona não encontrada" });
          return;
        }
      }

      const slots = await timeslotRepository.findActiveByDistributor(distributorId);
      res.json({ distributor_id: distributorId, date: parsed.data.date, slots });
    } catch (error) {
      handleError(error, res, { zoneId });
    }
  },

  // ─── Coverage ─────────────────────────────────────────────

  /** POST /api/zones/:id/coverage */
  async addCoverage(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;

    const parsed = coverageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    const ownerId = await resolveZoneOwner(zoneId, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      const result = await zonesService.addCoverage(zoneId, parsed.data, actorFrom(req));
      res.status(201).json(result);
    } catch (error) {
      handleError(error, res, { zoneId });
    }
  },

  /** POST /api/zones/:id/coverage/bulk — import de lista colada pela Ops. */
  async addCoverageBulk(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;

    const parsed = coverageBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    const ownerId = await resolveZoneOwner(zoneId, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      const result = await zonesService.addCoverageBulk(
        zoneId,
        parsed.data.items,
        actorFrom(req)
      );
      res.status(201).json(result);
    } catch (error) {
      handleError(error, res, { zoneId });
    }
  },

  /** POST /api/zones/:id/coverage/preview — checa conflitos sem gravar. */
  async previewCoverage(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;

    const parsed = coverageBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]!.message });
      return;
    }

    const ownerId = await resolveZoneOwner(zoneId, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      const preview = await zonesService.previewConflicts(zoneId, parsed.data.items);
      res.json(preview);
    } catch (error) {
      handleError(error, res, { zoneId });
    }
  },

  /** DELETE /api/zones/:id/coverage?coverageId=... */
  async removeCoverage(req: Request, res: Response): Promise<void> {
    const zoneId = req.params.id as string;
    const coverageId = req.query.coverageId as string | undefined;

    if (!coverageId) {
      res.status(400).json({ error: "coverageId obrigatório" });
      return;
    }

    const ownerId = await resolveZoneOwner(zoneId, res);
    if (!ownerId) return;
    if (await denyIfNotOwner(req, res, ownerId)) return;

    try {
      await zonesService.removeCoverage(coverageId, zoneId, actorFrom(req));
      res.status(204).end();
    } catch (error) {
      handleError(error, res, { zoneId, coverageId });
    }
  },
};
