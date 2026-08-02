/**
 * Metas dos KPIs operacionais (docs/doc_contexto/03-domain-data.md §2.6).
 * Fonte única para backend e frontend — não duplicar esses números em páginas.
 */
export const KPI_TARGETS = {
  /** SLA de aceitação: aceites dentro do prazo / recebidos. Meta ≥ 98%. */
  slaAcceptance: 98,
  /** Taxa de aceitação: aceitos / recebidos. Meta ≥ 95%. */
  acceptanceRate: 95,
  /** Taxa de reentrega: reentregas / entregues. Meta ≤ 3%. */
  redeliveryRate: 3,
} as const;

/** Fallback quando a distribuidora não tem `acceptance_sla_seconds` definido. */
export const DEFAULT_ACCEPTANCE_SLA_SECONDS = 180;

/** Margem (em pontos percentuais) a partir da qual um desvio vira `critical`. */
export const KPI_CRITICAL_MARGIN_PP = 5;

export type KpiStatus = "ok" | "warning" | "critical";

/** KPIs em que o valor deve ficar ABAIXO da meta (o resto é "quanto maior, melhor"). */
const LOWER_IS_BETTER = new Set<keyof typeof KPI_TARGETS>(["redeliveryRate"]);

/**
 * Classifica um KPI isolado contra sua meta.
 * `warning` = violou a meta; `critical` = violou por mais de KPI_CRITICAL_MARGIN_PP.
 */
export function classifyKpi(
  kpi: keyof typeof KPI_TARGETS,
  value: number
): KpiStatus {
  const target = KPI_TARGETS[kpi];
  const deviation = LOWER_IS_BETTER.has(kpi) ? value - target : target - value;

  if (deviation <= 0) return "ok";
  return deviation > KPI_CRITICAL_MARGIN_PP ? "critical" : "warning";
}

/** Pior status entre os três KPIs — o semáforo da linha na tabela de OPS. */
export function aggregateKpiStatus(kpis: {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
}): KpiStatus {
  const statuses = [
    classifyKpi("slaAcceptance", kpis.sla_acceptance_pct),
    classifyKpi("acceptanceRate", kpis.acceptance_rate_pct),
    classifyKpi("redeliveryRate", kpis.redelivery_rate_pct),
  ];

  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "ok";
}
