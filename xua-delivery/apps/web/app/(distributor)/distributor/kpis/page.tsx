"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KPI_TARGETS, classifyKpi } from "@xua/shared/constants/kpi";
import type { KpiSeriesPoint } from "@xua/shared/types";

import {
  ChartFrame,
  KPI_COLORS,
  TimeSeriesChart,
  formatPercent,
} from "@/src/components/charts";
import { KpiStatusPill } from "@/src/components/ops/dashboard/kpi-status-pill";
import { PeriodSelector } from "@/src/components/shared/period-selector";
import { api } from "@/src/lib/api-client";

interface KpiData {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
  series: Array<Pick<KpiSeriesPoint, "date" | "sla_pct" | "acceptance_pct" | "redelivery_pct">>;
}

const CARD_CLASS =
  "rounded-2xl bg-card/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm";

const KPI_CARDS = [
  {
    label: "SLA de aceite",
    kpi: "slaAcceptance",
    valueKey: "sla_acceptance_pct",
    seriesKey: "sla_pct",
    comparator: "≥",
    color: KPI_COLORS.sla,
  },
  {
    label: "Taxa de aceite",
    kpi: "acceptanceRate",
    valueKey: "acceptance_rate_pct",
    seriesKey: "acceptance_pct",
    comparator: "≥",
    color: KPI_COLORS.acceptance,
  },
  {
    label: "Taxa de reentrega",
    kpi: "redeliveryRate",
    valueKey: "redelivery_rate_pct",
    seriesKey: "redelivery_pct",
    comparator: "≤",
    color: KPI_COLORS.redelivery,
  },
] as const;

export default function KpisPage() {
  const [period, setPeriod] = useState("7d");

  const { data: kpis, isLoading, isError } = useQuery<KpiData>({
    queryKey: ["kpis", period],
    queryFn: () =>
      api.get<{ kpis: KpiData }>(`/api/ops/kpis?period=${period}`).then((r) => r.kpis),
    staleTime: 60_000,
  });

  const series = kpis?.series ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-heading text-lg font-bold">KPIs</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os KPIs. Tente novamente.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {KPI_CARDS.map((card) => {
          const value = kpis?.[card.valueKey] ?? 0;
          const target = KPI_TARGETS[card.kpi];

          return (
            <div key={card.valueKey} className={CARD_CLASS}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}{" "}
                <span className="normal-case">
                  (meta {card.comparator} {target}%)
                </span>
              </p>

              {isLoading ? (
                <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
              ) : (
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-heading text-3xl font-bold">{formatPercent(value)}</p>
                  <KpiStatusPill status={classifyKpi(card.kpi, value)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {KPI_CARDS.map((card) => (
          <ChartFrame
            key={card.seriesKey}
            title={card.label}
            isLoading={isLoading}
            isEmpty={series.length === 0}
          >
            <TimeSeriesChart
              data={series}
              xKey="date"
              yDomain={[0, 100]}
              showLegend={false}
              series={[{ key: card.seriesKey, label: card.label, color: card.color }]}
              targets={[{ value: KPI_TARGETS[card.kpi], label: `Meta ${KPI_TARGETS[card.kpi]}%` }]}
            />
          </ChartFrame>
        ))}
      </div>
    </div>
  );
}
