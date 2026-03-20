"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface KpiData {
  sla_acceptance_pct: number;
  acceptance_rate_pct: number;
  redelivery_rate_pct: number;
}

export default function KpisPage() {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orders?scope=kpis&period=${period}`)
      .then((r) => r.json())
      .then((data) => setKpis(data.kpis ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">KPIs</h1>
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
      ) : !kpis ? (
        <p className="text-gray-500">Sem dados disponíveis.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">SLA Aceite (≤15min)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{kpis.sla_acceptance_pct.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${Math.min(100, kpis.sla_acceptance_pct)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Taxa de Aceite</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{kpis.acceptance_rate_pct.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${Math.min(100, kpis.acceptance_rate_pct)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Taxa de Reentrega</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{kpis.redelivery_rate_pct.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full"
                  style={{ width: `${Math.min(100, kpis.redelivery_rate_pct)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gráficos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-48 bg-gray-50 rounded-md flex items-center justify-center text-gray-400 text-sm">
            Integração Recharts (placeholder)
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
