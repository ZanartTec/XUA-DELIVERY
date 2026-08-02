"use client";

import { useQuery } from "@tanstack/react-query";
import type { KpiOverview } from "@xua/shared/types";

import { api } from "@/src/lib/api-client";

/**
 * Visão consolidada de KPIs da OPS.
 *
 * `staleTime` mais alto que o default de 30s do provider: é um painel
 * histórico agregado por período, não uma fila operacional.
 */
export function useOpsKpiOverview(period: string, distributorId?: string) {
  const query = useQuery<KpiOverview>({
    queryKey: ["ops-kpi-overview", period, distributorId ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ period });
      if (distributorId) params.set("distributorId", distributorId);
      return api.get<KpiOverview>(`/api/ops/kpis/overview?${params}`);
    },
    staleTime: 60_000,
  });

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
