"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
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
    queryFn: () => api.get<{ kpis: KpiData }>(`/api/kpis?period=${period}`).then((r) => r.kpis),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">KPIs</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-6"><div className="h-8 w-16 rounded bg-muted" /></CardContent>
            </Card>
          ))}
        </div>
      ) : !kpis ? (
        <p className="text-muted-foreground">Sem dados disponíveis.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">SLA Aceite (≤15min)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{kpis.sla_acceptance_pct.toFixed(1)}%</p>
                <div className="mt-2 w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, kpis.sla_acceptance_pct)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Taxa de Aceite</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{kpis.acceptance_rate_pct.toFixed(1)}%</p>
                <div className="mt-2 w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, kpis.acceptance_rate_pct)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Taxa de Reentrega</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{kpis.redelivery_rate_pct.toFixed(1)}%</p>
                <div className="mt-2 w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, kpis.redelivery_rate_pct)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <KpiChart
                  data={[{ date: "Atual", value: kpis.sla_acceptance_pct }]}
                  target={98}
                  label="SLA Aceite"
                  color="#22c55e"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <KpiChart
                  data={[{ date: "Atual", value: kpis.acceptance_rate_pct }]}
                  target={95}
                  label="Taxa de Aceite"
                  color="#2563eb"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <KpiChart
                  data={[{ date: "Atual", value: kpis.redelivery_rate_pct }]}
                  target={3}
                  label="Taxa de Reentrega"
                  color="#f59e0b"
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
