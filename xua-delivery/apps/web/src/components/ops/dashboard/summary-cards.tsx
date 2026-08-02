"use client";

import type { ReactNode } from "react";
import { KPI_TARGETS, classifyKpi } from "@xua/shared/constants/kpi";
import type { DistributorKpiRow, KpiOverview } from "@xua/shared/types";

import { KPI_COLORS, Sparkline, formatInt, formatPercent } from "@/src/components/charts";
import { cn } from "@/src/lib/utils";
import { KpiStatusPill } from "./kpi-status-pill";

const CARD_CLASS =
  "rounded-2xl bg-card/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm";

/**
 * Cabeçalho do painel: os três KPIs consolidados (com sparkline da própria
 * série) e o par melhor/pior distribuidora.
 */
export function SummaryCards({
  overview,
  isDrillDown,
}: {
  overview: KpiOverview;
  isDrillDown: boolean;
}) {
  const { summary, series, ranking } = overview;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="SLA de aceite"
          value={summary.sla_acceptance_pct}
          target={KPI_TARGETS.slaAcceptance}
          comparator="≥"
          status={classifyKpi("slaAcceptance", summary.sla_acceptance_pct)}
          color={KPI_COLORS.sla}
          series={series}
          seriesKey="sla_pct"
        />
        <KpiCard
          label="Taxa de aceite"
          value={summary.acceptance_rate_pct}
          target={KPI_TARGETS.acceptanceRate}
          comparator="≥"
          status={classifyKpi("acceptanceRate", summary.acceptance_rate_pct)}
          color={KPI_COLORS.acceptance}
          series={series}
          seriesKey="acceptance_pct"
        />
        <KpiCard
          label="Taxa de reentrega"
          value={summary.redelivery_rate_pct}
          target={KPI_TARGETS.redeliveryRate}
          comparator="≤"
          status={classifyKpi("redeliveryRate", summary.redelivery_rate_pct)}
          color={KPI_COLORS.redelivery}
          series={series}
          seriesKey="redelivery_pct"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={CARD_CLASS}>
          <CardLabel>Volume no período</CardLabel>
          <p className="font-heading text-2xl font-bold text-foreground">
            {formatInt(summary.orders_received)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatInt(summary.orders_delivered)} entregues
            {!isDrillDown && ` · ${formatInt(summary.distributors_count)} distribuidoras`}
          </p>
        </div>

        {isDrillDown ? null : (
          <>
            <RankCard label="Melhor distribuidora" row={ranking.best} tone="success" />
            <RankCard label="Pior distribuidora" row={ranking.worst} tone="danger" />
          </>
        )}
      </div>
    </div>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function KpiCard({
  label,
  value,
  target,
  comparator,
  status,
  color,
  series,
  seriesKey,
}: {
  label: string;
  value: number;
  target: number;
  comparator: "≥" | "≤";
  status: ReturnType<typeof classifyKpi>;
  color: string;
  series: KpiOverview["series"];
  seriesKey: "sla_pct" | "acceptance_pct" | "redelivery_pct";
}) {
  return (
    <div className={CARD_CLASS}>
      <CardLabel>
        {label} <span className="normal-case">(meta {comparator} {target}%)</span>
      </CardLabel>

      <div className="flex items-baseline justify-between gap-2">
        <p className="font-heading text-3xl font-bold text-foreground">
          {formatPercent(value)}
        </p>
        <KpiStatusPill status={status} />
      </div>

      <div className="mt-2 h-9">
        {series.length > 1 && (
          <Sparkline data={series} dataKey={seriesKey} color={color} />
        )}
      </div>
    </div>
  );
}

function RankCard({
  label,
  row,
  tone,
}: {
  label: string;
  row: DistributorKpiRow | null;
  tone: "success" | "danger";
}) {
  return (
    <div className={CARD_CLASS}>
      <CardLabel>{label}</CardLabel>

      {row ? (
        <>
          <p
            className={cn(
              "truncate font-heading text-lg font-bold",
              tone === "success" ? "text-success" : "text-destructive"
            )}
            title={row.distributor_name}
          >
            {row.distributor_name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            SLA {formatPercent(row.sla_acceptance_pct)} · aceite{" "}
            {formatPercent(row.acceptance_rate_pct)} · reentrega{" "}
            {formatPercent(row.redelivery_rate_pct)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sem distribuidoras com volume no período.
        </p>
      )}
    </div>
  );
}
