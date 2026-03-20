"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface DistributorKpi {
  distributor_id: string;
  distributor_name: string;
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
}

export default function OpsKpisPage() {
  const [kpis, setKpis] = useState<DistributorKpi[]>([]);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orders?scope=ops_kpis&period=${period}`)
      .then((r) => r.json())
      .then((data) => setKpis(data.kpis ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">KPIs — Todos os Distribuidores</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="1d">Hoje</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : kpis.length === 0 ? (
        <p className="text-gray-500">Sem dados disponíveis.</p>
      ) : (
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
                  {kpis.map((k) => (
                    <tr key={k.distributor_id} className="border-b">
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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gráficos comparativos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-64 bg-gray-50 rounded-md flex items-center justify-center text-gray-400 text-sm">
            Integração Recharts (placeholder)
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
