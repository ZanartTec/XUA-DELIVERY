import { getPrisma } from "../../../infra/prisma/client.js";
import { AuditEventType } from "@xua/shared/enums";
import {
  DEFAULT_ACCEPTANCE_SLA_SECONDS,
  aggregateKpiStatus,
} from "@xua/shared/constants/kpi";
import type {
  DistributorKpiRow,
  KpiFunnelStage,
  KpiLatencyBucket,
  KpiOverview,
  KpiSeriesPoint,
} from "@xua/shared/types";

/**
 * KpiOverviewService — visão consolidada de KPIs para o painel da OPS.
 *
 * Substitui o laço N×3 do kpiController (3 queries raw por distribuidora ativa)
 * por 4 queries com GROUP BY, independentes da quantidade de distribuidoras.
 *
 * Doutrina (doc_contexto/01-blueprint.md §KPIs): as três taxas são calculadas
 * EXCLUSIVAMENTE sobre 18_aud_audit_events; 09_trn_orders entra apenas via JOIN
 * em CTE, para resolver a qual distribuidora o pedido pertence.
 *
 * Exceção consciente: `npsByDistributor` lê `nps_score` de 09_trn_orders porque
 * não existe evento de auditoria de NPS. A fórmula da doc (03-domain-data.md:149)
 * é definida sobre pedidos DELIVERED, e o repo já calcula assim em
 * distributor.repository.ts (findAvailableForZone). As três taxas seguem 100%
 * event-sourced.
 *
 * O SLA de aceitação usa `acceptance_sla_seconds` de cada distribuidora
 * (03_mst_distributors), não o 180s fixo do kpi.service.ts legado.
 */

/** Linha crua da agregação por distribuidora — contagens, sem taxas. */
interface AggregateRow {
  distributor_id: string;
  distributor_name: string;
  received: number;
  within_sla: number;
  accepted: number;
  rejected: number;
  dispatched: number;
  delivered: number;
  redeliveries: number;
}

/** Divisão percentual segura: denominador zero devolve 0, nunca NaN. */
function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

/**
 * Uma passada sobre audit_events, agrupada por distribuidora.
 * Reduz os eventos a uma linha por pedido (per_order) antes de contar, de modo
 * que reemissões do mesmo evento não inflem os denominadores.
 */
async function fetchDistributorAggregates(
  startDate: Date,
  endDate: Date,
  distributorId?: string
): Promise<AggregateRow[]> {
  const prisma = getPrisma();
  const filter = distributorId ?? null;

  return prisma.$queryRaw<AggregateRow[]>`
    WITH scoped_events AS (
      SELECT ae.order_id, ae.event_type, ae.occurred_at, o.distributor_id
      FROM "18_aud_audit_events" ae
      JOIN "09_trn_orders" o ON o.id = ae.order_id
      WHERE ae.occurred_at BETWEEN ${startDate} AND ${endDate}
        AND (${filter}::uuid IS NULL OR o.distributor_id = ${filter}::uuid)
        AND ae.event_type IN (
          ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type",
          ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type",
          ${AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR}::"audit_event_type",
          ${AuditEventType.ORDER_DISPATCHED}::"audit_event_type",
          ${AuditEventType.ORDER_DELIVERED}::"audit_event_type",
          ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type"
        )
    ),
    per_order AS (
      SELECT
        distributor_id,
        order_id,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type" THEN occurred_at END) AS received_at,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type" THEN occurred_at END) AS accepted_at,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_REJECTED_BY_DISTRIBUTOR}::"audit_event_type" THEN occurred_at END) AS rejected_at,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_DISPATCHED}::"audit_event_type" THEN occurred_at END) AS dispatched_at,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_DELIVERED}::"audit_event_type" THEN occurred_at END) AS delivered_at,
        MIN(CASE WHEN event_type = ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type" THEN occurred_at END) AS redelivery_at
      FROM scoped_events
      GROUP BY distributor_id, order_id
    )
    SELECT
      d.id AS distributor_id,
      d.name AS distributor_name,
      COUNT(po.received_at)::int AS received,
      COUNT(CASE
        WHEN po.received_at IS NOT NULL AND po.accepted_at IS NOT NULL
         AND EXTRACT(EPOCH FROM (po.accepted_at - po.received_at)) <= d.acceptance_sla_seconds
        THEN 1 END)::int AS within_sla,
      COUNT(po.accepted_at)::int AS accepted,
      COUNT(po.rejected_at)::int AS rejected,
      COUNT(po.dispatched_at)::int AS dispatched,
      COUNT(po.delivered_at)::int AS delivered,
      COUNT(po.redelivery_at)::int AS redeliveries
    FROM "03_mst_distributors" d
    LEFT JOIN per_order po ON po.distributor_id = d.id
    WHERE d.is_active = true
      AND (${filter}::uuid IS NULL OR d.id = ${filter}::uuid)
    GROUP BY d.id, d.name
    ORDER BY d.name ASC
  `;
}

/**
 * Série diária com os dias vazios preenchidos (generate_series), para a linha
 * temporal não "pular" datas sem movimento.
 * Cada pedido é ancorado no dia do evento que serve de denominador: recebimento
 * para SLA/aceitação, entrega para reentrega.
 */
async function fetchDailySeries(
  startDate: Date,
  endDate: Date,
  distributorId?: string
): Promise<KpiSeriesPoint[]> {
  const prisma = getPrisma();
  const filter = distributorId ?? null;

  const rows = await prisma.$queryRaw<
    Array<{
      day: Date;
      received: number;
      within_sla: number;
      accepted: number;
      delivered: number;
      redeliveries: number;
      orders_count: number;
    }>
  >`
    WITH scoped_events AS (
      SELECT ae.order_id, ae.event_type, ae.occurred_at, o.distributor_id
      FROM "18_aud_audit_events" ae
      JOIN "09_trn_orders" o ON o.id = ae.order_id
      WHERE ae.occurred_at BETWEEN ${startDate} AND ${endDate}
        AND (${filter}::uuid IS NULL OR o.distributor_id = ${filter}::uuid)
        AND ae.event_type IN (
          ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type",
          ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type",
          ${AuditEventType.ORDER_DELIVERED}::"audit_event_type",
          ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type",
          ${AuditEventType.ORDER_CREATED}::"audit_event_type"
        )
    ),
    per_order AS (
      SELECT
        se.order_id,
        d.acceptance_sla_seconds AS sla_seconds,
        MIN(CASE WHEN se.event_type = ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type" THEN se.occurred_at END) AS received_at,
        MIN(CASE WHEN se.event_type = ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type" THEN se.occurred_at END) AS accepted_at,
        MIN(CASE WHEN se.event_type = ${AuditEventType.ORDER_DELIVERED}::"audit_event_type" THEN se.occurred_at END) AS delivered_at,
        MIN(CASE WHEN se.event_type = ${AuditEventType.REDELIVERY_REQUIRED}::"audit_event_type" THEN se.occurred_at END) AS redelivery_at,
        MIN(CASE WHEN se.event_type = ${AuditEventType.ORDER_CREATED}::"audit_event_type" THEN se.occurred_at END) AS created_at
      FROM scoped_events se
      JOIN "03_mst_distributors" d ON d.id = se.distributor_id
      WHERE d.is_active = true
      GROUP BY se.order_id, d.acceptance_sla_seconds
    ),
    days AS (
      SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day'::interval)::date AS day
    ),
    received_by_day AS (
      SELECT
        received_at::date AS day,
        COUNT(*)::int AS received,
        COUNT(CASE
          WHEN accepted_at IS NOT NULL
           AND EXTRACT(EPOCH FROM (accepted_at - received_at)) <= sla_seconds
          THEN 1 END)::int AS within_sla,
        COUNT(accepted_at)::int AS accepted
      FROM per_order
      WHERE received_at IS NOT NULL
      GROUP BY received_at::date
    ),
    delivered_by_day AS (
      SELECT delivered_at::date AS day, COUNT(*)::int AS delivered
      FROM per_order WHERE delivered_at IS NOT NULL
      GROUP BY delivered_at::date
    ),
    redelivery_by_day AS (
      SELECT redelivery_at::date AS day, COUNT(*)::int AS redeliveries
      FROM per_order WHERE redelivery_at IS NOT NULL
      GROUP BY redelivery_at::date
    ),
    created_by_day AS (
      SELECT created_at::date AS day, COUNT(*)::int AS orders_count
      FROM per_order WHERE created_at IS NOT NULL
      GROUP BY created_at::date
    )
    SELECT
      days.day,
      COALESCE(r.received, 0)::int AS received,
      COALESCE(r.within_sla, 0)::int AS within_sla,
      COALESCE(r.accepted, 0)::int AS accepted,
      COALESCE(dl.delivered, 0)::int AS delivered,
      COALESCE(rd.redeliveries, 0)::int AS redeliveries,
      COALESCE(c.orders_count, 0)::int AS orders_count
    FROM days
    LEFT JOIN received_by_day r ON r.day = days.day
    LEFT JOIN delivered_by_day dl ON dl.day = days.day
    LEFT JOIN redelivery_by_day rd ON rd.day = days.day
    LEFT JOIN created_by_day c ON c.day = days.day
    ORDER BY days.day ASC
  `;

  return rows.map((row) => ({
    date: new Date(row.day).toISOString().slice(0, 10),
    sla_pct: pct(Number(row.within_sla), Number(row.received)),
    acceptance_pct: pct(Number(row.accepted), Number(row.received)),
    redelivery_pct: pct(Number(row.redeliveries), Number(row.delivered)),
    orders_count: Number(row.orders_count),
  }));
}

/** Rótulos dos buckets, na ordem em que aparecem no gráfico. */
const LATENCY_BUCKETS: ReadonlyArray<{ key: string; label: string; withinSla: boolean }> = [
  { key: "lt_60", label: "< 1 min", withinSla: true },
  { key: "lt_120", label: "1–2 min", withinSla: true },
  { key: "lt_180", label: "2–3 min", withinSla: true },
  { key: "lt_300", label: "3–5 min", withinSla: false },
  { key: "gte_300", label: "> 5 min", withinSla: false },
  { key: "not_accepted", label: "Não aceito", withinSla: false },
];

/**
 * Distribuição do tempo até o aceite — mostra o quão perto do limite a operação
 * está, algo que a taxa agregada esconde.
 *
 * Os buckets são absolutos e a fronteira "dentro do SLA" usa o padrão de 3 min
 * (DEFAULT_ACCEPTANCE_SLA_SECONDS); distribuidoras com SLA customizado têm o
 * próprio limite refletido no KPI de SLA, não neste histograma.
 */
async function fetchAcceptanceLatency(
  startDate: Date,
  endDate: Date,
  distributorId?: string
): Promise<KpiLatencyBucket[]> {
  const prisma = getPrisma();
  const filter = distributorId ?? null;

  const rows = await prisma.$queryRaw<Array<{ bucket: string; count: number }>>`
    WITH scoped_events AS (
      SELECT ae.order_id, ae.event_type, ae.occurred_at
      FROM "18_aud_audit_events" ae
      JOIN "09_trn_orders" o ON o.id = ae.order_id
      JOIN "03_mst_distributors" d ON d.id = o.distributor_id
      WHERE ae.occurred_at BETWEEN ${startDate} AND ${endDate}
        AND (${filter}::uuid IS NULL OR o.distributor_id = ${filter}::uuid)
        AND d.is_active = true
        AND ae.event_type IN (
          ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type",
          ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type"
        )
    ),
    per_order AS (
      SELECT
        order_id,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR}::"audit_event_type" THEN occurred_at END) AS received_at,
        MIN(CASE WHEN event_type = ${AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR}::"audit_event_type" THEN occurred_at END) AS accepted_at
      FROM scoped_events
      GROUP BY order_id
    )
    SELECT
      CASE
        WHEN accepted_at IS NULL THEN 'not_accepted'
        WHEN EXTRACT(EPOCH FROM (accepted_at - received_at)) < 60 THEN 'lt_60'
        WHEN EXTRACT(EPOCH FROM (accepted_at - received_at)) < 120 THEN 'lt_120'
        WHEN EXTRACT(EPOCH FROM (accepted_at - received_at)) < ${DEFAULT_ACCEPTANCE_SLA_SECONDS} THEN 'lt_180'
        WHEN EXTRACT(EPOCH FROM (accepted_at - received_at)) < 300 THEN 'lt_300'
        ELSE 'gte_300'
      END AS bucket,
      COUNT(*)::int AS count
    FROM per_order
    WHERE received_at IS NOT NULL
    GROUP BY 1
  `;

  const counts = new Map(rows.map((r) => [r.bucket, Number(r.count)]));

  return LATENCY_BUCKETS.map((b) => ({
    bucket: b.label,
    count: counts.get(b.key) ?? 0,
    within_sla: b.withinSla,
  }));
}

/**
 * NPS médio por distribuidora — ROUND(AVG(nps_score), 1) sobre pedidos
 * entregues no período (03-domain-data.md §2.6).
 */
async function fetchNpsByDistributor(
  startDate: Date,
  endDate: Date,
  distributorId?: string
): Promise<Map<string, number>> {
  const prisma = getPrisma();
  const filter = distributorId ?? null;

  const rows = await prisma.$queryRaw<
    Array<{ distributor_id: string; avg_nps: number }>
  >`
    SELECT
      o.distributor_id,
      ROUND(AVG(o.nps_score)::numeric, 1)::float8 AS avg_nps
    FROM "09_trn_orders" o
    JOIN "03_mst_distributors" d ON d.id = o.distributor_id
    WHERE o.nps_score IS NOT NULL
      AND o.status = 'DELIVERED'::"order_status"
      AND o.delivered_at BETWEEN ${startDate} AND ${endDate}
      AND (${filter}::uuid IS NULL OR o.distributor_id = ${filter}::uuid)
      AND d.is_active = true
    GROUP BY o.distributor_id
  `;

  return new Map(rows.map((r) => [r.distributor_id, Number(r.avg_nps)]));
}

/** Estágios do funil, na ordem do fluxo do pedido. */
function buildFunnel(rows: AggregateRow[]): KpiFunnelStage[] {
  const sum = (pick: (row: AggregateRow) => number) =>
    rows.reduce((acc, row) => acc + Number(pick(row)), 0);

  return [
    { stage: "received", label: "Recebidos", count: sum((r) => r.received) },
    { stage: "accepted", label: "Aceitos", count: sum((r) => r.accepted) },
    { stage: "dispatched", label: "Despachados", count: sum((r) => r.dispatched) },
    { stage: "delivered", label: "Entregues", count: sum((r) => r.delivered) },
    { stage: "rejected", label: "Rejeitados", count: sum((r) => r.rejected) },
    { stage: "redelivery", label: "Reentregas", count: sum((r) => r.redeliveries) },
  ];
}

/**
 * Score único para ordenar distribuidoras: média dos três KPIs, com a taxa de
 * reentrega invertida (é "quanto menor, melhor"). Distribuidoras sem pedidos
 * recebidos no período ficam fora do ranking — 0% sem volume não é "pior".
 */
function rankingScore(row: DistributorKpiRow): number {
  return (
    (row.sla_acceptance_pct +
      row.acceptance_rate_pct +
      (100 - row.redelivery_rate_pct)) /
    3
  );
}

export const kpiOverviewService = {
  async getOverview(
    startDate: Date,
    endDate: Date,
    distributorId?: string
  ): Promise<KpiOverview> {
    const [aggregates, series, acceptanceLatency, npsByDistributor] =
      await Promise.all([
        fetchDistributorAggregates(startDate, endDate, distributorId),
        fetchDailySeries(startDate, endDate, distributorId),
        fetchAcceptanceLatency(startDate, endDate, distributorId),
        fetchNpsByDistributor(startDate, endDate, distributorId),
      ]);

    const byDistributor: DistributorKpiRow[] = aggregates.map((row) => {
      const received = Number(row.received);
      const delivered = Number(row.delivered);

      const kpis = {
        sla_acceptance_pct: pct(Number(row.within_sla), received),
        acceptance_rate_pct: pct(Number(row.accepted), received),
        redelivery_rate_pct: pct(Number(row.redeliveries), delivered),
      };

      return {
        distributor_id: row.distributor_id,
        distributor_name: row.distributor_name,
        ...kpis,
        avg_nps: npsByDistributor.get(row.distributor_id) ?? null,
        orders_received: received,
        orders_delivered: delivered,
        // Sem volume no período não há o que classificar — evita pintar de
        // vermelho uma distribuidora que simplesmente não recebeu pedidos.
        status: received > 0 ? aggregateKpiStatus(kpis) : "ok",
      };
    });

    const totals = aggregates.reduce(
      (acc, row) => ({
        received: acc.received + Number(row.received),
        within_sla: acc.within_sla + Number(row.within_sla),
        accepted: acc.accepted + Number(row.accepted),
        delivered: acc.delivered + Number(row.delivered),
        redeliveries: acc.redeliveries + Number(row.redeliveries),
      }),
      { received: 0, within_sla: 0, accepted: 0, delivered: 0, redeliveries: 0 }
    );

    const summaryKpis = {
      sla_acceptance_pct: pct(totals.within_sla, totals.received),
      acceptance_rate_pct: pct(totals.accepted, totals.received),
      redelivery_rate_pct: pct(totals.redeliveries, totals.delivered),
    };

    const ranked = byDistributor
      .filter((row) => row.orders_received > 0)
      .sort((a, b) => rankingScore(b) - rankingScore(a));

    return {
      summary: {
        ...summaryKpis,
        orders_received: totals.received,
        orders_delivered: totals.delivered,
        distributors_count: byDistributor.length,
        status:
          totals.received > 0 ? aggregateKpiStatus(summaryKpis) : "ok",
      },
      ranking: {
        best: ranked[0] ?? null,
        worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
      },
      by_distributor: byDistributor,
      series,
      funnel: buildFunnel(aggregates),
      acceptance_latency: acceptanceLatency,
    };
  },
};
