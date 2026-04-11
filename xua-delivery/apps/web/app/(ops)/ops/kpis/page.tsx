"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { KpiChart } from "@/src/components/shared/kpi-chart";
import { PeriodSelector } from "@/src/components/shared/period-selector";
import { api } from "@/src/lib/api-client";

interface DistributorKpi {
  distributor_id: string;
  distributor_name: string;
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
}

interface SingleKpi {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
}

export default function OpsKpisPage() {
  const [period, setPeriod] = useState("7d");
  const [selectedDistributor, setSelectedDistributor] = useState<string>("");

  const { data: allKpis, isLoading } = useQuery<DistributorKpi[]>({
    queryKey: ["ops-kpis", period],
    queryFn: () => api.get<{ kpis: DistributorKpi[] }>(`/api/ops/kpis?period=${period}`).then((r) => r.kpis),
  });

  const { data: detailKpi } = useQuery<SingleKpi>({
    queryKey: ["ops-kpi-detail", period, selectedDistributor],
    queryFn: () =>
      api.get<{ kpis: SingleKpi }>(`/api/ops/kpis?period=${period}&distributorId=${selectedDistributor}`).then((r) => r.kpis),
    enabled: !!selectedDistributor,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold font-heading text-foreground">KPIs — Todos os Distribuidores</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <div className="h-8 w-16 rounded-lg bg-[#e1e3e4]" />
            </div>
          ))}
        </div>
      ) : !allKpis || allKpis.length === 0 ? (
        <p className="text-muted-foreground">Sem dados disponíveis.</p>
      ) : (
        <>
          <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <p className="text-sm font-semibold font-heading mb-3">Resumo por distribuidor</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ borderBottom: "1px solid #e1e3e4" }}>
                    <th className="py-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Distribuidor</th>
                    <th className="py-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold text-center">SLA Aceite</th>
                    <th className="py-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold text-center">Taxa Aceite</th>
                    <th className="py-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold text-center">Taxa Reentrega</th>
                  </tr>
                </thead>
                <tbody>
                  {allKpis.map((k) => (
                    <tr
                      key={k.distributor_id}
                      className={`cursor-pointer transition-colors hover:bg-[#e1e3e4]/40 ${
                        selectedDistributor === k.distributor_id ? "bg-primary/5" : ""
                      }`}
                      style={{ borderBottom: "1px solid #e1e3e4" }}
                      onClick={() => setSelectedDistributor(k.distributor_id)}
                    >
                      <td className="py-2">{k.distributor_name}</td>
                      <td className="py-2 text-center font-medium text-primary">{k.sla_acceptance_pct.toFixed(1)}%</td>
                      <td className="py-2 text-center font-medium text-primary">{k.acceptance_rate_pct.toFixed(1)}%</td>
                      <td className="py-2 text-center font-medium text-primary">{k.redelivery_rate_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedDistributor && detailKpi && (
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <p className="text-sm font-semibold font-heading mb-3">
                Gráficos — {allKpis.find((k) => k.distributor_id === selectedDistributor)?.distributor_name}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiChart
                  data={[{ date: "Atual", value: detailKpi.sla_acceptance_pct }]}
                  target={98}
                  label="SLA Aceite"
                  color="#22c55e"
                />
                <KpiChart
                  data={[{ date: "Atual", value: detailKpi.acceptance_rate_pct }]}
                  target={95}
                  label="Taxa de Aceite"
                  color="#1B4A9A"
                />
                <KpiChart
                  data={[{ date: "Atual", value: detailKpi.redelivery_rate_pct }]}
                  target={3}
                  label="Taxa de Reentrega"
                  color="#f59e0b"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
