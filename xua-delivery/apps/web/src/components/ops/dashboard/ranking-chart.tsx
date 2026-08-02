"use client";

import { useMemo, useState } from "react";
import { KPI_TARGETS } from "@xua/shared/constants/kpi";
import type { DistributorKpiRow } from "@xua/shared/types";

import { CategoryBarChart, KPI_COLORS } from "@/src/components/charts";
import { cn } from "@/src/lib/utils";

type RankingMetric = "sla" | "acceptance" | "redelivery";

const METRICS: Record<
  RankingMetric,
  {
    label: string;
    field: keyof Pick<
      DistributorKpiRow,
      "sla_acceptance_pct" | "acceptance_rate_pct" | "redelivery_rate_pct"
    >;
    target: number;
    color: string;
    /** Reentrega é "quanto menor, melhor" — inverte a ordenação. */
    lowerIsBetter: boolean;
  }
> = {
  sla: {
    label: "SLA",
    field: "sla_acceptance_pct",
    target: KPI_TARGETS.slaAcceptance,
    color: KPI_COLORS.sla,
    lowerIsBetter: false,
  },
  acceptance: {
    label: "Aceite",
    field: "acceptance_rate_pct",
    target: KPI_TARGETS.acceptanceRate,
    color: KPI_COLORS.acceptance,
    lowerIsBetter: false,
  },
  redelivery: {
    label: "Reentrega",
    field: "redelivery_rate_pct",
    target: KPI_TARGETS.redeliveryRate,
    color: KPI_COLORS.redelivery,
    lowerIsBetter: true,
  },
};

const METRIC_ORDER: RankingMetric[] = ["sla", "acceptance", "redelivery"];

/**
 * Ranking de distribuidoras no KPI selecionado, com a meta marcada.
 * Só entram distribuidoras com pedidos no período — 0% sem volume não é
 * um desempenho ruim, é ausência de dado.
 */
export function RankingChart({ rows }: { rows: DistributorKpiRow[] }) {
  const [metric, setMetric] = useState<RankingMetric>("sla");
  const config = METRICS[metric];

  const data = useMemo(() => {
    return rows
      .filter((row) => row.orders_received > 0)
      .map((row) => ({ name: row.distributor_name, value: row[config.field] }))
      .sort((a, b) => (config.lowerIsBetter ? a.value - b.value : b.value - a.value));
  }, [rows, config]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex justify-end gap-1">
        {METRIC_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMetric(key)}
            aria-pressed={metric === key}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs transition-colors",
              metric === key
                ? "bg-[#00E0FF] font-semibold text-[#001735]"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        <CategoryBarChart
          data={data}
          categoryKey="name"
          layout="bars"
          domain={[0, metric === "redelivery" ? "auto" : 100]}
          series={[{ key: "value", label: config.label, color: config.color }]}
          target={{ value: config.target, label: `Meta ${config.target}%` }}
        />
      </div>
    </div>
  );
}
