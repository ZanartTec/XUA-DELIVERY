import { prisma } from "@/src/lib/prisma";
import { AuditEventType } from "@/src/types/enums";

/**
 * KpiService — Cálculos EXCLUSIVAMENTE via audit_events (seção 1 — KPIs Operacionais).
 * NUNCA consulta 09_trn_orders para métricas.
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
    // PERF-01: CTE em vez de join N+1 em JavaScript
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

    const { total, within_sla: withinSla } = result[0] ?? { total: 0, within_sla: 0 };

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
    // PERF-02: CTE única em vez de 2 queries separadas
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
    // PERF-03: CTE única em vez de 2 queries separadas
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

    const { delivered, redeliveries } = result[0] ?? { delivered: 0, redeliveries: 0 };

    return {
      rate: delivered > 0 ? (redeliveries / delivered) * 100 : 0,
      redeliveries,
      delivered,
    };
  },
};
