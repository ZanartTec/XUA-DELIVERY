import type { KpiStatus } from "../constants/kpi";

/**
 * Contrato de GET /api/ops/kpis/overview.
 * Fonte única para o service da API e para o hook do painel de OPS.
 */

export interface DistributorKpiRow {
  distributor_id: string;
  distributor_name: string;
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
  /** null quando ninguém respondeu NPS no período. */
  avg_nps: number | null;
  orders_received: number;
  orders_delivered: number;
  status: KpiStatus;
}

export interface KpiSeriesPoint {
  /** ISO YYYY-MM-DD. Dias sem movimento vêm zerados, não ausentes. */
  date: string;
  sla_pct: number;
  acceptance_pct: number;
  redelivery_pct: number;
  orders_count: number;
}

export interface KpiFunnelStage {
  stage: string;
  label: string;
  count: number;
}

export interface KpiLatencyBucket {
  bucket: string;
  count: number;
  within_sla: boolean;
}

export interface KpiOverviewSummary {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
  orders_received: number;
  orders_delivered: number;
  distributors_count: number;
  status: KpiStatus;
}

export interface KpiOverview {
  summary: KpiOverviewSummary;
  ranking: {
    best: DistributorKpiRow | null;
    worst: DistributorKpiRow | null;
  };
  by_distributor: DistributorKpiRow[];
  series: KpiSeriesPoint[];
  funnel: KpiFunnelStage[];
  acceptance_latency: KpiLatencyBucket[];
}
