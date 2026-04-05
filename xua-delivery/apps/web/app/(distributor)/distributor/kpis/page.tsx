"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiChart } from "@/src/components/shared/kpi-chart";
import { PeriodSelector } from "@/src/components/shared/period-selector";
import { api } from "@/src/lib/api-client";

interface KpiData {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
}

export default function KpisPage() {
  const [period, setPeriod] = useState("7d");

  const { data: kpis, isLoading } = useQuery<KpiData>({
    queryKey: ["kpis", period],
    queryFn: () => api.get<{ kpis: KpiData }>(`/api/ops/kpis?period=${period}`).then((r) => r.kpis),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading">KPIs</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
              <div className="h-8 w-16 rounded-lg bg-[#e1e3e4]" />
            </div>
          ))}
        </div>
      ) : !kpis ? (
        <p className="text-muted-foreground">Sem dados disponíveis.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">SLA Aceite (≤15min)</p>
              <p className="text-3xl font-bold">{kpis.sla_acceptance_pct.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-[#e1e3e4] rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, kpis.sla_acceptance_pct)}%` }} />
              </div>
            </div>
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Taxa de Aceite</p>
              <p className="text-3xl font-bold">{kpis.acceptance_rate_pct.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-[#e1e3e4] rounded-full h-2">
                <div className="bg-[#0041c8] h-2 rounded-full transition-all" style={{ width: `${Math.min(100, kpis.acceptance_rate_pct)}%` }} />
              </div>
            </div>
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Taxa de Reentrega</p>
              <p className="text-3xl font-bold">{kpis.redelivery_rate_pct.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-[#e1e3e4] rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, kpis.redelivery_rate_pct)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <KpiChart data={[{ date: "Atual", value: kpis.sla_acceptance_pct }]} target={98} label="SLA Aceite" color="#22c55e" />
            </div>
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <KpiChart data={[{ date: "Atual", value: kpis.acceptance_rate_pct }]} target={95} label="Taxa de Aceite" color="#0041c8" />
            </div>
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <KpiChart data={[{ date: "Atual", value: kpis.redelivery_rate_pct }]} target={3} label="Taxa de Reentrega" color="#f59e0b" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
