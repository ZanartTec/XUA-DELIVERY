"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

/** Há plano de assinatura ativo? Sem plano, a UI não promove assinatura (fluxo morreria em "nenhum plano"). */
export function useHasActivePlans() {
  const query = useQuery({
    queryKey: ["subscription-plans", "active"],
    queryFn: () => api.get<{ plans?: unknown[] }>("/api/subscription-plans?activeOnly=true"),
    staleTime: 5 * 60_000,
  });
  return { hasPlans: (query.data?.plans?.length ?? 0) > 0, isLoading: query.isLoading };
}
