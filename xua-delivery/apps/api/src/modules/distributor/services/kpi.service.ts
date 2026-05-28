import { getPrisma } from "../../../infra/prisma/client.js";
import { AuditEventType } from "@xua/shared/enums";

type KpiEvent = {
  event_type: string;
  order_id: string | null;
  occurred_at: Date;
};

function dayKey(date: Date): string {
  return date.toISOString().split("T")[0];
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

/**
 * KpiService — Cálculos EXCLUSIVAMENTE via audit_events (seção 1 — KPIs Operacionais).
 * Usa a relação Prisma com Order apenas para escopo da distribuidora.
 */
export const kpiService = {
  /**
   * SLA de aceitação: aceites dentro do prazo / total recebidos.
   * Meta ≥ 98%.
   */
  async slaAcceptance(
    distributorId: string,
    startDate: Date,
    endDate: Date,
    slaSeconds: number = 180
  ): Promise<{ rate: number; total: number; withinSla: number }> {
    const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
      AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
      AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
    ]);
    const acceptedByOrder = new Map<string, KpiEvent[]>();

    for (const event of events) {
      if (!event.order_id || event.event_type !== AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR) {
        continue;
      }
      addEventToMap(acceptedByOrder, event.order_id, event);
    }

    let total = 0;
    let withinSla = 0;
    for (const event of events) {
      if (!event.order_id || event.event_type !== AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR) {
        continue;
      }

      const acceptedEvents = acceptedByOrder.get(event.order_id) ?? [];
      total += Math.max(acceptedEvents.length, 1);
      for (const acceptedEvent of acceptedEvents) {
        const elapsedSeconds =
          (acceptedEvent.occurred_at.getTime() - event.occurred_at.getTime()) / 1000;
        if (elapsedSeconds <= slaSeconds) {
          withinSla += 1;
        }
      }
    }

    return {
      rate: total > 0 ? (withinSla / total) * 100 : 0,
      total,
      withinSla,
    };
  },

  /**
   * Taxa de aceitação: aceitos / total recebidos.
   * Meta ≥ 95%.
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
    const total = events.filter(
      (event) => event.event_type === AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR
    ).length;
    const accepted = events.filter(
      (event) => event.event_type === AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR
    ).length;

    return {
      rate: total > 0 ? (accepted / total) * 100 : 0,
      accepted,
      total,
    };
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
    slaSeconds: number = 180
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
