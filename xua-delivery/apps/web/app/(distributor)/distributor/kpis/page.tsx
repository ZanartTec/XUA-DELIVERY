"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { KPI_TARGETS, classifyKpi } from "@xua/shared/constants/kpi";
import type { KpiSeriesPoint } from "@xua/shared/types";

import { ChartFrame, KPI_COLORS, TimeSeriesChart, formatPercent } from "@/src/components/charts";
import { KpiStatusPill } from "@/src/components/ops/dashboard/kpi-status-pill";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { api } from "@/src/lib/api-client";

interface KpiData {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
  series: Array<Pick<KpiSeriesPoint, "date" | "sla_pct" | "acceptance_pct" | "redelivery_pct">>;
}

const PERIODS = [
  { value: "1d", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

const KPI_CARDS = [
  {
    label: "Aceite no prazo",
    help: "Pedidos aceitos dentro do tempo de resposta.",
    kpi: "slaAcceptance",
    valueKey: "sla_acceptance_pct",
    seriesKey: "sla_pct",
    comparator: "≥",
    color: KPI_COLORS.sla,
  },
  {
    label: "Pedidos aceitos",
    help: "Dos pedidos recebidos, quantos você aceitou.",
    kpi: "acceptanceRate",
    valueKey: "acceptance_rate_pct",
    seriesKey: "acceptance_pct",
    comparator: "≥",
    color: KPI_COLORS.acceptance,
  },
  {
    label: "Reentregas",
    help: "Entregas que precisaram voltar outro dia.",
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
    queryFn: () => api.get<{ kpis: KpiData }>(`/api/ops/kpis?period=${period}`).then((r) => r.kpis),
    staleTime: 60_000,
  });
  const series = kpis?.series ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Indicadores" description="Como a operação está indo." sticky>
        <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v)} spacing={2} className="justify-start" aria-label="Período">
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value} className="h-9 rounded-md bg-muted px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>

      <div className="space-y-4 px-4 pb-6">
        {isError ? (
          <EmptyState icon={BarChart3} title="Não foi possível carregar os indicadores" description="Tente de novo em instantes." />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {KPI_CARDS.map((card) => {
                const value = kpis?.[card.valueKey] ?? 0;
                const target = KPI_TARGETS[card.kpi];
                return (
                  <section key={card.valueKey} className="rounded-2xl border border-hairline bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{card.label}</h2>
                      {!isLoading ? <KpiStatusPill status={classifyKpi(card.kpi, value)} /> : null}
                    </div>
                    {isLoading ? (
                      <Skeleton className="mt-2 h-9 w-24" />
                    ) : (
                      <p className="mt-1 font-heading text-3xl font-bold text-ink tabular-nums">{formatPercent(value)}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {card.help} Meta {card.comparator} {target}%.
                    </p>
                  </section>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {KPI_CARDS.map((card) => (
                <ChartFrame key={card.seriesKey} title={card.label} isLoading={isLoading} isEmpty={series.length === 0}>
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
          </>
        )}
      </div>
    </div>
  );
}
