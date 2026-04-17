import type { DeliveryWindow } from "@prisma/client";
import { scheduleRepository } from "../repository/schedule.repository.js";
import { capacityRepository } from "../repository/capacity.repository.js";
import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("schedule-service");

const SP_TZ = "America/Sao_Paulo";

/**
 * Retorna o "agora" no timezone America/Sao_Paulo como objeto Date
 * cujos campos (getFullYear, getDate, getHours) refletem a hora local SP.
 */
function nowInSaoPaulo(): Date {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: SP_TZ }));
  return sp;
}

/** YYYY-MM-DD de um Date (usando os componentes locais). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Cria um Date representando data YYYY-MM-DD + HH:00 no horário SP (campos locais). */
function dateAtHourSP(isoDate: string, hour: number): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m - 1), d, hour, 0, 0, 0);
}

/** Horário de início de cada janela (hora local SP). */
const WINDOW_START_HOUR: Record<string, number> = {
  morning: 8,
  afternoon: 12,
};

export class ScheduleServiceError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
    this.name = "ScheduleServiceError";
  }
}

export type AvailableDate = {
  date: string;
  weekday: number;
  morning_available: boolean;
  afternoon_available: boolean;
};

export const scheduleService = {
  /**
   * Gera lista de datas disponíveis para entrega respeitando:
   *  - Dias ativos da semana (DistributorSchedule)
   *  - Datas bloqueadas (DistributorBlockedDate)
   *  - lead_time_hours vs horário atual em America/Sao_Paulo
   *  - Capacidade configurada em DeliveryCapacity para a zona
   *
   * Se não houver DistributorSchedule cadastrado para a distribuidora,
   * todos os dias são considerados ativos (backward compatible) com
   * lead_time padrão de 2h.
   */
  async getAvailableDates(
    distributorId: string,
    zoneId: string,
    daysAhead = 14
  ): Promise<AvailableDate[]> {
    const nowSP = nowInSaoPaulo();
    const todayIso = toISODate(nowSP);

    // Data final (inclusiva) = hoje + daysAhead - 1
    const endDate = new Date(nowSP);
    endDate.setDate(endDate.getDate() + daysAhead - 1);
    const endIso = toISODate(endDate);

    const [schedules, blocked, capacitySlots] = await Promise.all([
      scheduleRepository.findScheduleByDistributor(distributorId),
      scheduleRepository.findBlockedDates(distributorId, todayIso, endIso),
      capacityRepository.findAvailable(zoneId, todayIso, endIso),
    ]);

    // Index schedule por weekday (0-6). Se vazio → todos os dias ativos.
    const scheduleMap = new Map<number, { is_active: boolean; lead_time_hours: number }>();
    for (const s of schedules) {
      scheduleMap.set(s.weekday, {
        is_active: s.is_active,
        lead_time_hours: s.lead_time_hours,
      });
    }
    const hasSchedule = scheduleMap.size > 0;

    // Set de datas bloqueadas
    const blockedSet = new Set(blocked.map((b) => toISODate(new Date(b.blocked_date))));

    // Index capacidade por "date|window" → tem_slot
    // Se não há nenhum slot cadastrado para a zona, ignora restrição de capacidade
    // (backward compatible: agenda sem capacidade = capacidade ilimitada)
    const hasCapacityConfig = capacitySlots.length > 0;
    const capacityMap = new Map<string, boolean>();
    for (const slot of capacitySlots) {
      const dateIso = toISODate(new Date(slot.delivery_date));
      const key = `${dateIso}|${slot.window.toLowerCase()}`;
      capacityMap.set(key, true);
    }

    const result: AvailableDate[] = [];
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(nowSP);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const iso = toISODate(d);
      const weekday = d.getDay();

      // 1. Dia ativo no schedule?
      const cfg = scheduleMap.get(weekday);
      const isActive = hasSchedule ? cfg?.is_active === true : true;
      const leadTimeHours = cfg?.lead_time_hours ?? 2;

      // 2. Data bloqueada?
      const isBlocked = blockedSet.has(iso);

      if (!isActive || isBlocked) {
        result.push({
          date: iso,
          weekday,
          morning_available: false,
          afternoon_available: false,
        });
        continue;
      }

      // 3. Para cada janela: verifica lead_time e capacidade
      // Se não há configuração de capacidade, considera disponível (ilimitado)
      const morningAvailable =
        this.isWindowAfterLeadTime(iso, "morning", leadTimeHours, nowSP) &&
        (!hasCapacityConfig || capacityMap.get(`${iso}|morning`) === true);

      const afternoonAvailable =
        this.isWindowAfterLeadTime(iso, "afternoon", leadTimeHours, nowSP) &&
        (!hasCapacityConfig || capacityMap.get(`${iso}|afternoon`) === true);

      result.push({
        date: iso,
        weekday,
        morning_available: morningAvailable,
        afternoon_available: afternoonAvailable,
      });
    }

    return result;
  },

  /** True se o início da janela está a >= leadTimeHours do "agora SP". */
  isWindowAfterLeadTime(
    isoDate: string,
    window: "morning" | "afternoon",
    leadTimeHours: number,
    nowSP: Date
  ): boolean {
    const hour = WINDOW_START_HOUR[window];
    const windowStart = dateAtHourSP(isoDate, hour);
    const diffMs = windowStart.getTime() - nowSP.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours >= leadTimeHours;
  },

  /**
   * Valida se a combinação data+janela ainda aceita pedidos para a distribuidora.
   * Lança ScheduleServiceError (status 422) se inválida.
   */
  async validateDeliveryDate(
    distributorId: string,
    date: string,
    window: DeliveryWindow
  ): Promise<void> {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) {
      throw new ScheduleServiceError("INVALID_DATE", "Data de entrega inválida");
    }

    const localDate = new Date(y, m - 1, d);
    const weekday = localDate.getDay();
    const windowLower = window.toString().toLowerCase() as "morning" | "afternoon";

    const [schedules, blocked] = await Promise.all([
      scheduleRepository.findScheduleByDistributor(distributorId),
      scheduleRepository.findBlockedDates(distributorId, date, date),
    ]);

    const scheduleMap = new Map<number, { is_active: boolean; lead_time_hours: number }>();
    for (const s of schedules) {
      scheduleMap.set(s.weekday, {
        is_active: s.is_active,
        lead_time_hours: s.lead_time_hours,
      });
    }
    const hasSchedule = scheduleMap.size > 0;
    const cfg = scheduleMap.get(weekday);
    const isActive = hasSchedule ? cfg?.is_active === true : true;
    const leadTimeHours = cfg?.lead_time_hours ?? 2;

    if (!isActive) {
      throw new ScheduleServiceError(
        "WEEKDAY_INACTIVE",
        "A distribuidora não opera no dia selecionado"
      );
    }

    if (blocked.length > 0) {
      throw new ScheduleServiceError(
        "DATE_BLOCKED",
        "Data indisponível para entrega"
      );
    }

    const nowSP = nowInSaoPaulo();
    if (!this.isWindowAfterLeadTime(date, windowLower, leadTimeHours, nowSP)) {
      throw new ScheduleServiceError(
        "LEAD_TIME_VIOLATION",
        `Janela de entrega requer antecedência mínima de ${leadTimeHours}h`
      );
    }

    log.info({ distributorId, date, window, leadTimeHours }, "Delivery date validated");
  },

  async getScheduleConfig(distributorId: string, daysAhead = 30) {
    const nowSP = nowInSaoPaulo();
    const todayIso = toISODate(nowSP);
    const endDate = new Date(nowSP);
    endDate.setDate(endDate.getDate() + daysAhead - 1);
    const endIso = toISODate(endDate);

    const [schedules, blocked] = await Promise.all([
      scheduleRepository.findScheduleByDistributor(distributorId),
      scheduleRepository.findBlockedDates(distributorId, todayIso, endIso),
    ]);

    return {
      weekdays: schedules.map((s) => ({
        weekday: s.weekday,
        is_active: s.is_active,
        lead_time_hours: s.lead_time_hours,
      })),
      blocked_dates: blocked.map((b) => ({
        id: b.id,
        blocked_date: toISODate(new Date(b.blocked_date)),
        reason: b.reason,
      })),
    };
  },
};
