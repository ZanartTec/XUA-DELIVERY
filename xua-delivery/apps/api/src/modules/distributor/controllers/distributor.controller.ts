import type { Request, Response } from "express";
import { kpiService } from "../services/kpi.service.js";
import { capacityService } from "../services/capacity.service.js";
import { scheduleService } from "../services/schedule.service.js";
import { scheduleRepository } from "../repository/schedule.repository.js";
import { distributorRepository } from "../repository/distributor.repository.js";
import { parsePeriodDates } from "../../../utils/date.js";
import { createLogger } from "../../../infra/logger/index.js";
import { routeService } from "../services/route.service.js";
import { distributorQuerySchema } from "@xua/shared/schemas/distributor";
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
  async listAvailable(req: Request, res: Response): Promise<void> {
    const parsed = distributorQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
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
      log.error({ err }, "Erro ao buscar distribuidoras disponíveis");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/distributor/kpis?period=7d
   * Retorna KPIs do distribuidor autenticado.
   */
  async getKpis(req: Request, res: Response): Promise<void> {
    const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
    if (!distributorId) {
      res.status(403).json({ error: "Usuário não vinculado a nenhuma distribuidora" });
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
  async getDrivers(req: Request, res: Response): Promise<void> {
    try {
      const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (!distributorId) {
        res.status(403).json({ error: "Usuário não vinculado a nenhuma distribuidora" });
        return;
      }
      const drivers = await distributorRepository.findDriversByDistributor(distributorId);
      res.json({ drivers });
    } catch (err) {
      log.error({ err }, "Erro ao buscar motoristas");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/distributor/routes/:id
   * Retorna as paradas de uma rota diária agrupadas por zona e janela.
   */
  async getRouteById(req: Request, res: Response): Promise<void> {
    try {
      const distributorId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (!distributorId) {
        res.status(403).json({ error: "Usuário não vinculado a nenhuma distribuidora" });
        return;
      }

      const route = await routeService.getDailyRoute(distributorId, req.params.id as string);
      res.json({ route });
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_ROUTE_ID") {
        res.status(400).json({ error: "Rota inválida. Use yyyy-mm-dd ou 'today'." });
        return;
      }

      log.error({ err }, "Erro ao buscar rota do distribuidor");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * GET /api/distributor/capacity?zoneId=&start=&end=
   * Retorna slots de capacidade disponíveis em uma zone/período.
   */
  async getCapacity(req: Request, res: Response): Promise<void> {
    const { zoneId, start, end } = req.query as {
      zoneId: string;
      start: string;
      end: string;
    };

    if (!zoneId || !start || !end) {
      res.status(400).json({ error: "Parâmetros obrigatórios: zoneId, start, end" });
      return;
    }

    try {
      const slots = await capacityService.checkAvailability(zoneId, start, end);
      res.json({ slots });
    } catch (err) {
      log.error({ err, zoneId }, "Erro ao buscar capacidade");
      throw err;
    }
  },

  /**
   * GET /api/distributor/schedule/:distributorId
   * Retorna configuração de dias ativos + lead_time + datas bloqueadas.
   */
  async getScheduleConfig(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    if (!distributorId) {
      res.status(400).json({ error: "distributorId obrigatório" });
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        res.status(403).json({ error: "Sem permissão para acessar esta distribuidora" });
        return;
      }
    }

    try {
      const config = await scheduleService.getScheduleConfig(distributorId);
      res.json(config);
    } catch (err) {
      log.error({ err, distributorId }, "Erro ao buscar config de agenda");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * POST /api/distributor/schedule/:distributorId/weekdays
   * Configura múltiplos dias da semana em batch.
   */
  async upsertWeekdays(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const parsed = weekdayBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        res.status(403).json({ error: "Sem permissão para acessar esta distribuidora" });
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
      log.error({ err, distributorId }, "Erro ao configurar dias da semana");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * POST /api/distributor/schedule/:distributorId/block-date
   */
  async blockDate(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const parsed = blockDateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        res.status(403).json({ error: "Sem permissão para acessar esta distribuidora" });
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
        res.status(409).json({ error: "Data já está bloqueada" });
        return;
      }
      log.error({ err, distributorId }, "Erro ao bloquear data");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /**
   * DELETE /api/distributor/schedule/:distributorId/block-date/:date
   */
  async unblockDate(req: Request, res: Response): Promise<void> {
    const distributorId = req.params.distributorId as string;
    const date = req.params.date as string;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Data inválida (YYYY-MM-DD)" });
      return;
    }

    // Ownership: distributor_admin só acessa a própria distribuidora; ops acessa qualquer
    if (req.user!.role !== "ops") {
      const userDistId = await distributorRepository.resolveDistributorId(req.user!.sub);
      if (userDistId !== distributorId) {
        res.status(403).json({ error: "Sem permissão para acessar esta distribuidora" });
        return;
      }
    }

    try {
      await scheduleRepository.unblockDate(distributorId, date);
      res.status(204).end();
    } catch (err) {
      log.error({ err, distributorId, date }, "Erro ao desbloquear data");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
