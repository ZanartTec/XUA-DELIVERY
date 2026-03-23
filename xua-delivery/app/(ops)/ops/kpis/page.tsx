"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
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
    queryFn: () => api.get<{ kpis: DistributorKpi[] }>(`/api/kpis?period=${period}`).then((r) => r.kpis),
  });

  const { data: detailKpi } = useQuery<SingleKpi>({
    queryKey: ["ops-kpi-detail", period, selectedDistributor],
    queryFn: () =>
      api.get<{ kpis: SingleKpi }>(`/api/kpis?period=${period}&distributorId=${selectedDistributor}`).then((r) => r.kpis),
    enabled: !!selectedDistributor,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">KPIs — Todos os Distribuidores</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : !allKpis || allKpis.length === 0 ? (
        <p className="text-gray-500">Sem dados disponíveis.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Resumo por distribuidor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 font-medium">Distribuidor</th>
                      <th className="py-2 font-medium text-center">SLA Aceite</th>
                      <th className="py-2 font-medium text-center">Taxa Aceite</th>
                      <th className="py-2 font-medium text-center">Taxa Reentrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allKpis.map((k) => (
                      <tr
                        key={k.distributor_id}
                        className={`border-b cursor-pointer hover:bg-muted/50 ${
                          selectedDistributor === k.distributor_id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedDistributor(k.distributor_id)}
                      >
                        <td className="py-2">{k.distributor_name}</td>
                        <td className="py-2 text-center">{k.sla_acceptance_pct.toFixed(1)}%</td>
                        <td className="py-2 text-center">{k.acceptance_rate_pct.toFixed(1)}%</td>
                        <td className="py-2 text-center">{k.redelivery_rate_pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {selectedDistributor && detailKpi && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Gráficos — {allKpis.find((k) => k.distributor_id === selectedDistributor)?.distributor_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                    color="#2563eb"
                  />
                  <KpiChart
                    data={[{ date: "Atual", value: detailKpi.redelivery_rate_pct }]}
                    target={3}
                    label="Taxa de Reentrega"
                    color="#f59e0b"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
