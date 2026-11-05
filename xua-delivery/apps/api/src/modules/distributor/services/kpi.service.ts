import { getPrisma } from "../../../infra/prisma/client.js";
import { AuditEventType } from "@xua/shared/enums";
import { DEFAULT_ACCEPTANCE_SLA_SECONDS } from "@xua/shared/constants/kpi";

type KpiEvent = {
  event_type: string;
  order_id: string | null;
  occurred_at: Date;
};

// Dia de calendário da operação (America/Sao_Paulo): em UTC, um pedido das
// 21h caía no dia seguinte do gráfico.
const OPERATION_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(date: Date): string {
  return OPERATION_DAY.format(date);
}

function eventKey(day: string, orderId: string): string {
  return `${day}|${orderId}`;
}

function addEventToMap(map: Map<string, KpiEvent[]>, key: string, event: KpiEvent): void {
  const events = map.get(key) ?? [];
  events.push(event);
  map.set(key, events);
}

async function findDistributorAuditEvents(
  distributorId: string,
  startDate: Date,
  endDate: Date,
  eventTypes: AuditEventType[]
): Promise<KpiEvent[]> {
  const prisma = getPrisma();
  return prisma.auditEvent.findMany({
    where: {
      event_type: { in: eventTypes },
      occurred_at: { gte: startDate, lte: endDate },
      order: { distributor_id: distributorId },
    },
    select: {
      event_type: true,
      order_id: true,
      occurred_at: true,
    },
    orderBy: { occurred_at: "asc" },
  });
}

/** Primeiro "recebido" e primeiro "aceito" de cada pedido (eventos já vêm em ordem). */
function firstEventsByOrder(events: KpiEvent[]) {
  const receivedAt = new Map<string, Date>();
  const acceptedAt = new Map<string, Date>();
  for (const event of events) {
    if (!event.order_id) continue;
    if (event.event_type === AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR && !receivedAt.has(event.order_id)) {
      receivedAt.set(event.order_id, event.occurred_at);
    }
    if (event.event_type === AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR && !acceptedAt.has(event.order_id)) {
      acceptedAt.set(event.order_id, event.occurred_at);
    }
  }
  return { receivedAt, acceptedAt };
}

/**
 * KpiService — Cálculos EXCLUSIVAMENTE via audit_events (seção 1 — KPIs Operacionais).
 * Usa a relação Prisma com Order apenas para escopo da distribuidora.
 */
export const kpiService = {
  /**
   * SLA de aceitação: pedidos recebidos no período cujo primeiro aceite saiu
   * dentro do prazo / pedidos recebidos no período. Meta ≥ 98%.
   *
   * Conta pedidos distintos (não eventos): um aceite sem o "recebido"
   * correspondente — pedido antigo ou recebido fora do período — não entra
   * no numerador nem no denominador.
   */
  async slaAcceptance(
    distributorId: string,
    startDate: Date,
    endDate: Date,
    slaSeconds?: number
  ): Promise<{ rate: number; total: number; withinSla: number }> {
    // Mesmo prazo que a fila mostra para a distribuidora (acceptance_sla_seconds).
    const sla =
      slaSeconds ??
      (await getPrisma().distributor.findUnique({ where: { id: distributorId }, select: { acceptance_sla_seconds: true } }))
        ?.acceptance_sla_seconds ??
      DEFAULT_ACCEPTANCE_SLA_SECONDS;
    const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
      AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
      AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
    ]);
    const { receivedAt, acceptedAt } = firstEventsByOrder(events);

    let withinSla = 0;
    for (const [orderId, received] of receivedAt) {
      const accepted = acceptedAt.get(orderId);
      if (accepted && (accepted.getTime() - received.getTime()) / 1000 <= sla) withinSla += 1;
    }
    const total = receivedAt.size;

    return { rate: total > 0 ? (withinSla / total) * 100 : 0, total, withinSla };
  },

  /**
   * Taxa de aceitação: pedidos recebidos no período que foram aceitos /
   * pedidos recebidos no período. Meta ≥ 95%. Nunca passa de 100% (D-04: antes
   * contava eventos de aceite soltos e chegava a 200%).
   */
  async acceptanceRate(
    distributorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ rate: number; accepted: number; total: number }> {
    const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
      AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
      AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
    ]);
    const { receivedAt, acceptedAt } = firstEventsByOrder(events);
    const total = receivedAt.size;
    let accepted = 0;
    for (const orderId of receivedAt.keys()) if (acceptedAt.has(orderId)) accepted += 1;

    return { rate: total > 0 ? (accepted / total) * 100 : 0, accepted, total };
  },

  /**
   * Taxa de reentrega: redelivery / total entregues.
   * Meta ≤ 3%.
   */
  async redeliveryRate(
    distributorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ rate: number; redeliveries: number; delivered: number }> {
    const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
      AuditEventType.ORDER_DELIVERED,
      AuditEventType.REDELIVERY_REQUIRED,
    ]);
    const delivered = events.filter(
      (event) => event.event_type === AuditEventType.ORDER_DELIVERED
    ).length;
    const redeliveries = events.filter(
      (event) => event.event_type === AuditEventType.REDELIVERY_REQUIRED
    ).length;

    return {
      rate: delivered > 0 ? (redeliveries / delivered) * 100 : 0,
      redeliveries,
      delivered,
    };
  },

  /**
   * Série diária de KPIs para gráficos.
   * Retorna um ponto por dia no intervalo, com SLA, aceitação e reentrega.
   */
  async getDailySeries(
    distributorId: string,
    startDate: Date,
    endDate: Date,
    slaSeconds: number = DEFAULT_ACCEPTANCE_SLA_SECONDS
  ): Promise<Array<{ date: string; sla_pct: number; acceptance_pct: number; redelivery_pct: number }>> {
    const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
      AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
      AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
      AuditEventType.ORDER_DELIVERED,
      AuditEventType.REDELIVERY_REQUIRED,
    ]);
    const statsByDay = new Map<
      string,
      {
        totalReceived: Set<string>;
        withinSla: Set<string>;
        accepted: Set<string>;
        delivered: Set<string>;
        redeliveries: Set<string>;
      }
    >();
    const receivedByOrderDay = new Map<string, KpiEvent[]>();
    const acceptedByOrderDay = new Map<string, KpiEvent[]>();

    for (const event of events) {
      if (!event.order_id) {
        continue;
      }

      const day = dayKey(event.occurred_at);
      const stats = statsByDay.get(day) ?? {
        totalReceived: new Set<string>(),
        withinSla: new Set<string>(),
        accepted: new Set<string>(),
        delivered: new Set<string>(),
        redeliveries: new Set<string>(),
      };
      statsByDay.set(day, stats);

      if (event.event_type === AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR) {
        stats.totalReceived.add(event.order_id);
        addEventToMap(receivedByOrderDay, eventKey(day, event.order_id), event);
      }
      if (event.event_type === AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR) {
        stats.accepted.add(event.order_id);
        addEventToMap(acceptedByOrderDay, eventKey(day, event.order_id), event);
      }
      if (event.event_type === AuditEventType.ORDER_DELIVERED) {
        stats.delivered.add(event.order_id);
      }
      if (event.event_type === AuditEventType.REDELIVERY_REQUIRED) {
        stats.redeliveries.add(event.order_id);
      }
    }

    for (const [key, receivedEvents] of receivedByOrderDay) {
      const acceptedEvents = acceptedByOrderDay.get(key) ?? [];
      const [day, orderId] = key.split("|");
      const stats = statsByDay.get(day);
      if (!stats || !orderId) {
        continue;
      }

      const acceptedWithinSla = receivedEvents.some((receivedEvent) =>
        acceptedEvents.some((acceptedEvent) => {
          const elapsedSeconds =
            (acceptedEvent.occurred_at.getTime() - receivedEvent.occurred_at.getTime()) / 1000;
          return elapsedSeconds <= slaSeconds;
        })
      );

      if (acceptedWithinSla) {
        stats.withinSla.add(orderId);
      }
    }

    return [...statsByDay.entries()]
      .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
      .map(([date, stats]) => {
        const totalReceived = stats.totalReceived.size;
        const withinSla = stats.withinSla.size;
        const accepted = stats.accepted.size;
        const delivered = stats.delivered.size;
        const redeliveries = stats.redeliveries.size;

        return {
          date,
          sla_pct: totalReceived > 0 ? (withinSla / totalReceived) * 100 : 0,
          acceptance_pct: totalReceived > 0 ? (accepted / totalReceived) * 100 : 0,
          redelivery_pct: delivered > 0 ? (redeliveries / delivered) * 100 : 0,
        };
      });
  },
};
