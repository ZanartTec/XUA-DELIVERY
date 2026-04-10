import { getPrisma } from "../../../infra/prisma/client.js";
import { AuditEventType } from "@prisma/client";
import { createLogger } from "../../../infra/logger";

const log = createLogger("kpi");

/**
 * KpiService — Cálculos EXCLUSIVAMENTE via audit_events (seção 1 — KPIs Operacionais).
 * NUNCA consulta 09_trn_orders para métricas diretamente. Apenas via JOIN em CTE.
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
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<
      Array<{ total: number; within_sla: number }>
    >`
      WITH received AS (
        SELECT ae.order_id, ae.occurred_at AS received_at
        FROM "18_aud_audit_events" ae
        JOIN "09_trn_orders" o ON o.id = ae.order_id
        WHERE ae.event_type = ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type"
        AND ae.occurred_at BETWEEN ${startDate} AND ${endDate}
        AND o.distributor_id = ${distributorId}::uuid
      ),
      accepted AS (
        SELECT order_id, occurred_at AS accepted_at
        FROM "18_aud_audit_events"
        WHERE event_type = ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type"
        AND occurred_at BETWEEN ${startDate} AND ${endDate}
      )
      SELECT
        COUNT(r.order_id)::int AS total,
        COUNT(CASE WHEN EXTRACT(EPOCH FROM (a.accepted_at - r.received_at)) <= ${slaSeconds} THEN 1 END)::int AS within_sla
      FROM received r
      LEFT JOIN accepted a ON a.order_id = r.order_id
    `;

    const { total, within_sla: withinSla } = result[0] ?? {
      total: 0,
      within_sla: 0,
    };

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
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<
      Array<{ total: number; accepted: number }>
    >`
      WITH dist_orders AS (
        SELECT id FROM "09_trn_orders" WHERE distributor_id = ${distributorId}::uuid
      )
      SELECT
        COUNT(CASE WHEN event_type = ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type" THEN 1 END)::int AS total,
        COUNT(CASE WHEN event_type = ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type" THEN 1 END)::int AS accepted
      FROM "18_aud_audit_events"
      WHERE event_type IN (
        ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type",
        ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type"
      )
      AND occurred_at BETWEEN ${startDate} AND ${endDate}
      AND order_id IN (SELECT id FROM dist_orders)
    `;

    const { total, accepted } = result[0] ?? { total: 0, accepted: 0 };

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
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<
      Array<{ delivered: number; redeliveries: number }>
    >`
      WITH dist_orders AS (
        SELECT id FROM "09_trn_orders" WHERE distributor_id = ${distributorId}::uuid
      )
      SELECT
        COUNT(CASE WHEN event_type = ${AuditEventType.ORDER_DELIVERED}::"audit_event_type" THEN 1 END)::int AS delivered,
        COUNT(CASE WHEN event_type = ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type" THEN 1 END)::int AS redeliveries
      FROM "18_aud_audit_events"
      WHERE event_type IN (
        ${AuditEventType.ORDER_DELIVERED}::"audit_event_type",
        ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type"
      )
      AND occurred_at BETWEEN ${startDate} AND ${endDate}
      AND order_id IN (SELECT id FROM dist_orders)
    `;

    const { delivered, redeliveries } = result[0] ?? {
      delivered: 0,
      redeliveries: 0,
    };

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
    const prisma = getPrisma();

    const rows = await prisma.$queryRaw<
      Array<{
        day: Date;
        total_received: number;
        within_sla: number;
        accepted: number;
        delivered: number;
        redeliveries: number;
      }>
    >`
      WITH dist_orders AS (
        SELECT id FROM "09_trn_orders" WHERE distributor_id = ${distributorId}::uuid
      ),
      daily_events AS (
        SELECT
          DATE(occurred_at) AS day,
          event_type,
          order_id,
          occurred_at
        FROM "18_aud_audit_events"
        WHERE occurred_at BETWEEN ${startDate} AND ${endDate}
          AND order_id IN (SELECT id FROM dist_orders)
      ),
      received_events AS (
        SELECT order_id, day, occurred_at AS received_at
        FROM daily_events
        WHERE event_type = ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type"
      ),
      accepted_events AS (
        SELECT order_id, day, occurred_at AS accepted_at
        FROM daily_events
        WHERE event_type = ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type"
      )
      SELECT
        COALESCE(r.day, a.day, d.day) AS day,
        COUNT(DISTINCT r.order_id)::int AS total_received,
        COUNT(DISTINCT CASE
          WHEN EXTRACT(EPOCH FROM (a.accepted_at - r.received_at)) <= ${slaSeconds}
          THEN r.order_id END)::int AS within_sla,
        COUNT(DISTINCT a.order_id)::int AS accepted,
        COUNT(DISTINCT CASE
          WHEN d.event_type = ${AuditEventType.ORDER_DELIVERED}::"audit_event_type"
          THEN d.order_id END)::int AS delivered,
        COUNT(DISTINCT CASE
          WHEN d.event_type = ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type"
          THEN d.order_id END)::int AS redeliveries
      FROM received_events r
      FULL OUTER JOIN accepted_events a ON a.order_id = r.order_id AND a.day = r.day
      FULL OUTER JOIN (
        SELECT order_id, day, event_type FROM daily_events
        WHERE event_type IN (
          ${AuditEventType.ORDER_DELIVERED}::"audit_event_type",
          ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type"
        )
      ) d ON d.order_id = COALESCE(r.order_id, a.order_id) AND d.day = COALESCE(r.day, a.day)
      GROUP BY COALESCE(r.day, a.day, d.day)
      ORDER BY day ASC
    `;

    return rows.map((row) => {
      const totalReceived = Number(row.total_received);
      const withinSla = Number(row.within_sla);
      const accepted = Number(row.accepted);
      const delivered = Number(row.delivered);
      const redeliveries = Number(row.redeliveries);

      return {
        date: new Date(row.day).toISOString().slice(0, 10),
        sla_pct: totalReceived > 0 ? (withinSla / totalReceived) * 100 : 0,
        acceptance_pct: totalReceived > 0 ? (accepted / totalReceived) * 100 : 0,
        redelivery_pct: delivered > 0 ? (redeliveries / delivered) * 100 : 0,
      };
    });
  },
};
