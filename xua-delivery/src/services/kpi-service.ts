import db from "@/src/lib/db";
import { AuditEventType } from "@/src/types/enums";

const AUDIT_TABLE = "18_aud_audit_events";

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
    const result = await db.raw(
      `
      WITH received AS (
        SELECT ae.order_id, ae.occurred_at AS received_at
        FROM "${AUDIT_TABLE}" ae
        JOIN "09_trn_orders" o ON o.id = ae.order_id
        WHERE ae.event_type = ?
        AND ae.occurred_at BETWEEN ? AND ?
        AND o.distributor_id = ?
      ),
      accepted AS (
        SELECT order_id, occurred_at AS accepted_at
        FROM "${AUDIT_TABLE}"
        WHERE event_type = ?
        AND occurred_at BETWEEN ? AND ?
      )
      SELECT
        COUNT(r.order_id)::int AS total,
        COUNT(CASE WHEN EXTRACT(EPOCH FROM (a.accepted_at - r.received_at)) <= ? THEN 1 END)::int AS within_sla
      FROM received r
      LEFT JOIN accepted a ON a.order_id = r.order_id
      `,
      [
        AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
        startDate,
        endDate,
        distributorId,
        AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
        startDate,
        endDate,
        slaSeconds,
      ]
    );

    const { total, within_sla: withinSla } = result.rows[0] ?? { total: 0, within_sla: 0 };

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
    const received = await db(AUDIT_TABLE)
      .where({ event_type: AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR })
      .whereBetween("occurred_at", [startDate, endDate])
      .whereRaw(
        `order_id IN (SELECT id FROM "09_trn_orders" WHERE distributor_id = ?)`,
        [distributorId]
      )
      .count("id as count")
      .first();

    const accepted = await db(AUDIT_TABLE)
      .where({ event_type: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR })
      .whereBetween("occurred_at", [startDate, endDate])
      .whereRaw(
        `order_id IN (SELECT id FROM "09_trn_orders" WHERE distributor_id = ?)`,
        [distributorId]
      )
      .count("id as count")
      .first();

    const totalCount = Number(received?.count || 0);
    const acceptedCount = Number(accepted?.count || 0);

    return {
      rate: totalCount > 0 ? (acceptedCount / totalCount) * 100 : 0,
      accepted: acceptedCount,
      total: totalCount,
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
    const delivered = await db(AUDIT_TABLE)
      .where({ event_type: AuditEventType.ORDER_DELIVERED })
      .whereBetween("occurred_at", [startDate, endDate])
      .whereRaw(
        `order_id IN (SELECT id FROM "09_trn_orders" WHERE distributor_id = ?)`,
        [distributorId]
      )
      .count("id as count")
      .first();

    const redeliveries = await db(AUDIT_TABLE)
      .where({ event_type: AuditEventType.REDELIVERY_REQUIRED })
      .whereBetween("occurred_at", [startDate, endDate])
      .whereRaw(
        `order_id IN (SELECT id FROM "09_trn_orders" WHERE distributor_id = ?)`,
        [distributorId]
      )
      .count("id as count")
      .first();

    const deliveredCount = Number(delivered?.count || 0);
    const redeliveryCount = Number(redeliveries?.count || 0);

    return {
      rate: deliveredCount > 0 ? (redeliveryCount / deliveredCount) * 100 : 0,
      redeliveries: redeliveryCount,
      delivered: deliveredCount,
    };
  },
};
