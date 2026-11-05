"use client";

import { useMemo, useState } from "react";

import { ChartFrame } from "@/src/components/charts";
import { PageHeader } from "@/src/components/shared/page-header";
import { PeriodSelector } from "@/src/components/shared/period-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  getVisibleCharts,
  type OpsDashboardContext,
} from "@/src/components/ops/dashboard/chart-registry";
import { DistributorTable } from "@/src/components/ops/dashboard/distributor-table";
import { SummaryCards } from "@/src/components/ops/dashboard/summary-cards";
import { useOpsKpiOverview } from "@/src/hooks/ops/use-ops-kpis";
import { cn } from "@/src/lib/utils";

const ALL_DISTRIBUTORS = "ALL";

export default function OpsKpisPage() {
  const [period, setPeriod] = useState("7d");
  const [selectedDistributor, setSelectedDistributor] = useState("");

  // A lista de distribuidoras vem da visão global, para o select não sumir
  // enquanto o drill-down está ativo.
  const { overview: globalOverview } = useOpsKpiOverview(period);
  const { overview, isLoading, isError } = useOpsKpiOverview(
    period,
    selectedDistributor || undefined
  );

  const distributorOptions = globalOverview?.by_distributor ?? [];
  const isDrillDown = Boolean(selectedDistributor);

  const context: OpsDashboardContext | null = useMemo(
    () => (overview ? { overview, selectedDistributor } : null),
    [overview, selectedDistributor]
  );

  // Não depende do overview: a contagem de gráficos já é conhecida antes dos
  // dados chegarem, então os esqueletos do carregamento batem com o grid final.
  const visibleCharts = useMemo(
    () => getVisibleCharts(selectedDistributor),
    [selectedDistributor]
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4">
      <PageHeader
        className="px-0"
        title="Indicadores"
        description={isDrillDown ? "Visão de uma distribuidora." : "Todas as distribuidoras."}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedDistributor || ALL_DISTRIBUTORS}
            onValueChange={(value) =>
              setSelectedDistributor(value === ALL_DISTRIBUTORS ? "" : value)
            }
          >
            <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:w-60 sm:flex-none" aria-label="Distribuidora">
              <SelectValue placeholder="Distribuidora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DISTRIBUTORS}>Todas as distribuidoras</SelectItem>
              {distributorOptions.map((row) => (
                <SelectItem key={row.distributor_id} value={row.distributor_id}>
                  {row.distributor_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </PageHeader>

      {isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os KPIs. Tente novamente.
        </p>
      ) : (
        <>
          {overview && <SummaryCards overview={overview} isDrillDown={isDrillDown} />}

          {!isDrillDown && overview && (
            <DistributorTable
              rows={overview.by_distributor}
              selectedDistributor={selectedDistributor}
              onSelect={setSelectedDistributor}
            />
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {visibleCharts.map((chart) => (
              <ChartFrame
                key={chart.id}
                title={chart.title}
                description={chart.description}
                isLoading={isLoading || !context}
                isEmpty={context ? chart.isEmpty(context) : false}
                className={cn(chart.span === "full" && "md:col-span-2")}
              >
                {context ? chart.render(context) : null}
              </ChartFrame>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
