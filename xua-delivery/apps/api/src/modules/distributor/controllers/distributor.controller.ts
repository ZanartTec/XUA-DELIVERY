import type { NextFunction, Request, Response } from "express";
import { kpiService } from "../services/kpi.service.js";

import { scheduleService } from "../services/schedule.service.js";
import { scheduleRepository } from "../repository/schedule.repository.js";
import { timeslotRepository } from "../repository/timeslot.repository.js";
import { distributorRepository } from "../repository/distributor.repository.js";
import { parsePeriodDates } from "../../../utils/date.js";
import { createLogger } from "../../../infra/logger/index.js";
import { routeService } from "../services/route.service.js";
import { distributorService, DistributorServiceError } from "../services/distributor.service.js";
import { InventoryServiceError } from "../../inventory/services/inventory.service.js";
import {
  distributorQuerySchema,
  distributorCreateSchema,
  distributorUpdateSchema,
} from "@xua/shared/schemas/distributor";
import { driverCreateSchema, driverUpdateSchema } from "@xua/shared/schemas/driver";
import {
  inventoryBalanceQuerySchema,
  inventoryItemFilterSchema,
  inventoryInitialLoadSchema,
  inventoryMovementQuerySchema,
  inventoryReconciliationSessionOpenSchema,
  inventoryReconciliationSessionQuerySchema,
  inventoryReconciliationSessionCloseSchema,
  opsInventoryReadIdParamSchema,
} from "@xua/shared/schemas/inventory";
import { InventoryReconciliationSessionError } from "../../inventory/services/reconciliation-session.service.js";
import { badRequest, conflict, forbidden, notFound } from "../../../errors/index.js";
import {
  weekdayBulkSchema,
  blockDateSchema,
} from "@xua/shared/schemas/schedule";

const log = createLogger("distributor");

export const distributorController = {
  /**
   * GET /api/distributors?zone_id=&date=&window=
   * Lista distribuidoras disponíveis para seleção manual pelo consumidor.
   */
  async listAvailable(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = distributorQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const distributors = await distributorRepository.findAvailableForZone(
        parsed.data.zone_id,
        parsed.data.date,
        parsed.data.window,
      );
      res.json({ distributors });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/all
   * Lista TODAS as distribuidoras (ativas e inativas) com os campos
   * editáveis do CRUD — exclusivo para ops (rota protegida por `ops`-only
   * RBAC, então não há problema de segurança em expor distribuidoras
   * inativas aqui).
   */
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributors = await distributorRepository.findAllForOps();
      res.json({ distributors });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/kpis?period=7d
   * Retorna KPIs do distribuidor autenticado.
   */
  async getKpis(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
    if (!distributorId) {
      next(forbidden("Usuário não vinculado a nenhuma distribuidora"));
      return;
    }
    const period = (req.query.period as string) ?? "7d";
    const { start, end } = parsePeriodDates(period);

    try {
      const [sla, acceptance, redelivery] = await Promise.all([
        kpiService.slaAcceptance(distributorId, start, end),
        kpiService.acceptanceRate(distributorId, start, end),
        kpiService.redeliveryRate(distributorId, start, end),
      ]);

      res.json({
        kpis: {
          sla_acceptance_pct: sla.rate,
          acceptance_rate_pct: acceptance.rate,
          redelivery_rate_pct: redelivery.rate,
        },
      });
    } catch (err) {
      log.error({ err, distributorId }, "Erro ao buscar KPIs do distribuidor");
      throw err;
    }
  },

  /**
   * GET /api/distributor/drivers
   * Retorna lista de motoristas disponíveis para despacho.
   */
  async getDrivers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (!distributorId) {
        next(forbidden("Usuário não vinculado a nenhuma distribuidora"));
        return;
      }
      const drivers = await distributorRepository.findDriversByDistributor(distributorId);
      res.json({ drivers });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/inventory/balances
   * Lista saldos materializados da distribuidora autenticada.
   */
  async listInventoryBalances(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = inventoryBalanceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.listInventoryBalances({
        actorUserId: req.user!.sub,
        query: parsed.data,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/inventory/items
   * Lista itens de estoque ativos para filtros, carga inicial e conciliação.
   */
  async listInventoryItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = inventoryItemFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.listInventoryItems({
        actorUserId: req.user!.sub,
        query: parsed.data,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/inventory/movements
   * Lista movimentos de estoque da distribuidora autenticada.
   */
  async listInventoryMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = inventoryMovementQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.listInventoryMovements({
        actorUserId: req.user!.sub,
        query: parsed.data,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/distributor/inventory/initial-load
   * Registra carga inicial de estoque para a distribuidora autenticada.
   */
  async createInitialInventoryLoad(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = inventoryInitialLoadSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.createInitialInventoryLoad({
        actorUserId: req.user!.sub,
        payload: parsed.data,
      });

      res.status(result.applied_count > 0 ? 201 : 200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/distributor/inventory/reconciliation-sessions
   * Abre sessão física de conciliação da distribuidora autenticada.
   */
  async openInventoryReconciliationSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = inventoryReconciliationSessionOpenSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.openInventoryReconciliationSession({
        actorUserId: req.user!.sub,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/inventory/reconciliation-sessions
   * Lista sessões físicas da distribuidora autenticada.
   */
  async listInventoryReconciliationSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = inventoryReconciliationSessionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.listInventoryReconciliationSessions({
        actorUserId: req.user!.sub,
        query: parsed.data,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/inventory/reconciliation-sessions/:id
   * Consulta sessão física da distribuidora autenticada.
   */
  async getInventoryReconciliationSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = opsInventoryReadIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.getInventoryReconciliationSession({
        actorUserId: req.user!.sub,
        sessionId: parsed.data.id,
      });

      if (!result) {
        next(notFound("Sessão de conciliação não encontrada"));
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/distributor/inventory/reconciliation-sessions/:id/close
   * Fecha sessão física e aplica ajustes via ledger.
   */
  async closeInventoryReconciliationSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsedParams = opsInventoryReadIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      next(badRequest(parsedParams.error.issues[0]!.message));
      return;
    }

    const parsedBody = inventoryReconciliationSessionCloseSchema.safeParse(req.body);
    if (!parsedBody.success) {
      next(badRequest(parsedBody.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.closeInventoryReconciliationSession({
        actorUserId: req.user!.sub,
        sessionId: parsedParams.data.id,
        payload: parsedBody.data,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/routes/:id
   * Retorna as paradas de uma rota diária agrupadas por zona e janela.
   */
  async getRouteById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (!distributorId) {
        next(forbidden("Usuário não vinculado a nenhuma distribuidora"));
        return;
      }

      const route = await routeService.getDailyRoute(distributorId, req.params.id as string);
      res.json({ route });
    } catch (err) {
      next(err);
    }
  },



  /**
   * GET /api/distributors/:distributorId/public-schedule
   * Endpoint consumido pelo app do consumer para montar telas que dependem
   * dos dias úteis e horários disponíveis (ex.: criação de assinatura).
   * Retorna apenas weekdays e time slots ATIVOS.
   */
  async getPublicSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    if (!distributorId) {
      next(badRequest("distributorId obrigatório"));
      return;
    }

    try {
      const [weekdays, timeSlots] = await Promise.all([
        scheduleRepository.findScheduleByDistributor(distributorId),
        timeslotRepository.findActiveByDistributor(distributorId),
      ]);

      res.json({
        active_weekdays: weekdays.filter((w) => w.is_active).map((w) => w.weekday),
        time_slots: timeSlots,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/schedule/:distributorId
   * Retorna configuração de dias ativos + lead_time + datas bloqueadas.
   */
  async getScheduleConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    if (!distributorId) {
      next(badRequest("distributorId obrigatório"));
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão para acessar esta distribuidora"));
        return;
      }
    }

    try {
      const config = await scheduleService.getScheduleConfig(distributorId);
      res.json(config);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/distributor/schedule/:distributorId/weekdays
   * Configura múltiplos dias da semana em batch.
   */
  async upsertWeekdays(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const parsed = weekdayBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão para acessar esta distribuidora"));
        return;
      }
    }

    try {
      const prisma = (await import("../../../infra/prisma/client.js")).getPrisma();
      const results = await prisma.$transaction(async (tx: any) => {
        const items = [];
        for (const w of parsed.data.weekdays) {
          const result = await scheduleRepository.upsertWeekday(
            distributorId,
            w.weekday,
            { is_active: w.is_active, lead_time_hours: w.lead_time_hours },
            tx,
          );
          items.push(result);
        }
        return items;
      });
      res.status(200).json({ weekdays: results });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/distributor/schedule/:distributorId/block-date
   */
  async blockDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const parsed = blockDateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão para acessar esta distribuidora"));
        return;
      }
    }

    try {
      const blocked = await scheduleRepository.blockDate(
        distributorId,
        parsed.data.blocked_date,
        parsed.data.reason,
      );
      res.status(201).json(blocked);
    } catch (err: any) {
      if (err?.code === "P2002") {
        next(conflict("Data já está bloqueada"));
        return;
      }
      next(err);
    }
  },

  /**
   * DELETE /api/distributor/schedule/:distributorId/block-date/:date
   */
  async unblockDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const date = req.params.date as string;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      next(badRequest("Data inválida (YYYY-MM-DD)"));
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão para acessar esta distribuidora"));
        return;
      }
    }

    try {
      await scheduleRepository.unblockDate(distributorId, date);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  // ─── Time Slots CRUD ──────────────────────────────────────

  /** GET /api/distributor/schedule/:distributorId/time-slots */
  async listTimeSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;

    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão"));
        return;
      }
    }

    try {
      const slots = await timeslotRepository.findAllByDistributor(distributorId);
      res.json({ slots });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/distributor/schedule/:distributorId/time-slots */
  async upsertTimeSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;

    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão"));
        return;
      }
    }

    const { id, label, start_hour, start_minute, end_hour, end_minute, window, sort_order, is_active } = req.body;
    if (!label || start_hour == null || end_hour == null || !window) {
      next(badRequest("Campos obrigatórios: label, start_hour, end_hour, window"));
      return;
    }
    if (!["MORNING", "AFTERNOON"].includes(window)) {
      next(badRequest("window deve ser MORNING ou AFTERNOON"));
      return;
    }

    try {
      const slot = await timeslotRepository.upsertSlot(distributorId, {
        id,
        label,
        start_hour: Number(start_hour),
        start_minute: start_minute != null ? Number(start_minute) : 0,
        end_hour: Number(end_hour),
        end_minute: end_minute != null ? Number(end_minute) : 0,
        window,
        sort_order: sort_order != null ? Number(sort_order) : 0,
        is_active: is_active ?? true,
      });
      res.status(id ? 200 : 201).json(slot);
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/distributor/schedule/:distributorId/time-slots/:slotId/toggle */
  async toggleTimeSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const slotId = req.params.slotId as string;

    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão"));
        return;
      }
    }

    const { is_active } = req.body;
    if (typeof is_active !== "boolean") {
      next(badRequest("is_active (boolean) obrigatório"));
      return;
    }

    try {
      const slot = await timeslotRepository.toggleSlot(slotId, is_active);
      res.json(slot);
    } catch (err) {
      next(err);
    }
  },

  /** DELETE /api/distributor/schedule/:distributorId/time-slots/:slotId */
  async deleteTimeSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const slotId = req.params.slotId as string;

    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        next(forbidden("Sem permissão"));
        return;
      }
    }

    try {
      await timeslotRepository.deleteSlot(slotId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  // ─── CRUD de distribuidora (ops) ──────────────────────────

  /** POST /api/distributor — cria distribuidora + primeiro admin. Exclusivo para ops. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = distributorCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const result = await distributorService.createDistributor(parsed.data, req.user!.sub);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/distributor/:id — edita distribuidora, incluindo is_active. Exclusivo para ops. */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = req.params.id as string;

    const parsed = distributorUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const distributor = await distributorService.updateDistributor(id, parsed.data, req.user!.sub);
      res.json(distributor);
    } catch (err) {
      next(err);
    }
  },

  // ─── CRUD de motorista (distributor_admin, ops) ───────────

  /**
   * POST /api/distributor/drivers
   * `distributor_admin` cadastra para a própria distribuidora; `ops` deve
   * informar `distributor_id` no body.
   */
  async createDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = driverCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const driver = await distributorService.createDriver(
        { sub: req.user!.sub, role: req.user!.role },
        parsed.data
      );
      res.status(201).json(driver);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/distributor/drivers/:id
   * `distributor_admin` só edita motoristas da própria distribuidora.
   */
  async updateDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    const driverId = req.params.id as string;

    const parsed = driverUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      next(badRequest(parsed.error.issues[0]!.message));
      return;
    }

    try {
      const driver = await distributorService.updateDriver(
        { sub: req.user!.sub, role: req.user!.role },
        driverId,
        parsed.data
      );
      res.json(driver);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/distributor/drivers/all
   * Lista TODOS os motoristas do sistema (de qualquer distribuidora,
   * incluindo órfãos sem vínculo), com o nome da distribuidora de cada um —
   * exclusivo para a tela de gestão completa `ops`.
   */
  async listAllDrivers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const drivers = await distributorRepository.findAllDriversForOps();
      res.json({ drivers });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/distributor/drivers/unlinked — motoristas sem distribuidora. Exclusivo para ops. */
  async listUnlinkedDrivers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const drivers = await distributorService.listUnlinkedDrivers();
      res.json({ drivers });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/distributor/drivers/:id/link — vincula motorista órfão. Exclusivo para ops. */
  async linkDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    const driverId = req.params.id as string;
    const distributorId = req.body?.distributor_id;

    if (!distributorId || typeof distributorId !== "string") {
      next(badRequest("distributor_id obrigatório"));
      return;
    }

    try {
      const driver = await distributorService.linkDriver(driverId, distributorId, req.user!.sub);
      res.json(driver);
    } catch (err) {
      next(err);
    }
  },
};
