"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ZoneCoverage {
  id: string;
  neighborhood: string | null;
  zip_code: string | null;
}

/**
 * Linha da tabela. NÃO traz as linhas de cobertura — só a contagem: uma zona de
 * produção tem milhares delas. A cobertura vem de `useZoneCoverage`, paginada,
 * quando a linha é expandida.
 */
export interface OpsZone {
  id: string;
  name: string;
  distributor_id: string;
  is_active: boolean;
  distributor: { id: string; name: string; is_active: boolean };
  _count: { coverage: number; addresses: number; orders: number };
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

export type ZoneStatusFilter = "active" | "inactive" | "all";

export interface ZoneFilters {
  distributor_id: string | null;
  q: string;
  coverage: string;
  status: ZoneStatusFilter;
  offset: number;
  limit: number;
}

export const ZONES_PAGE_SIZE = 20;
export const COVERAGE_PAGE_SIZE = 20;

export interface DistributorOption {
  id: string;
  name: string;
  is_active: boolean;
}

export interface CoverageEntry {
  neighborhood?: string;
  zip_code?: string;
}

export interface CoverageConflict {
  neighborhood?: string;
  zip_code?: string;
  zone_id: string;
  zone_name: string;
}

export interface CoverageOverlapWarning {
  neighborhood?: string;
  zip_code?: string;
  zone_name: string;
  distributor_id: string;
  distributor_name: string;
}

export interface CoveragePreview {
  total: number;
  duplicates_in_payload: number;
  accepted_count: number;
  accepted: CoverageEntry[];
  conflicts: CoverageConflict[];
  warnings: CoverageOverlapWarning[];
}

export interface CoverageBulkResult extends Omit<CoveragePreview, "accepted" | "accepted_count"> {
  created_count: number;
  coverage: ZoneCoverage[];
}

// ─── Query keys ──────────────────────────────────────────────────────────────

/**
 * Toda mutação invalida zonas E cobertura: mexer na cobertura muda a contagem
 * exibida na linha da tabela, e transferir/desativar muda a própria listagem.
 */
function useInvalidateZones() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["ops-zones"] });
    queryClient.invalidateQueries({ queryKey: ["ops-zone-coverage"] });
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useOpsDistributors() {
  const query = useQuery<{ distributors: DistributorOption[] }>({
    queryKey: ["ops-distributors"],
    queryFn: () => api.get<{ distributors: DistributorOption[] }>("/api/distributor/all"),
    staleTime: 60_000,
  });

  return {
    distributors: query.data?.distributors ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Listagem paginada. Todos os filtros são resolvidos no banco. */
export function useOpsZones(filters: ZoneFilters) {
  const query = useQuery<{ zones: OpsZone[]; pagination: PaginationMeta }>({
    queryKey: [
      "ops-zones",
      filters.distributor_id,
      filters.q,
      filters.coverage,
      filters.status,
      filters.offset,
      filters.limit,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        status: filters.status,
        limit: String(filters.limit),
        offset: String(filters.offset),
      });
      if (filters.distributor_id) params.set("distributor_id", filters.distributor_id);
      if (filters.q) params.set("q", filters.q);
      if (filters.coverage) params.set("coverage", filters.coverage);
      return api.get(`/api/zones/all?${params}`);
    },
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  return {
    zones: query.data?.zones ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}

/** Cobertura de uma zona — só busca quando a linha está expandida. */
export function useZoneCoverage(
  zoneId: string,
  filters: { q: string; offset: number },
  enabled: boolean
) {
  const query = useQuery<{ coverage: ZoneCoverage[]; pagination: PaginationMeta }>({
    queryKey: ["ops-zone-coverage", zoneId, filters.q, filters.offset],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(COVERAGE_PAGE_SIZE),
        offset: String(filters.offset),
      });
      if (filters.q) params.set("q", filters.q);
      return api.get(`/api/zones/${zoneId}/coverage?${params}`);
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  return {
    coverage: query.data?.coverage ?? [],
    pagination: query.data?.pagination ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateZone() {
  const invalidate = useInvalidateZones();
  return useMutation({
    mutationFn: (input: { name: string; distributor_id: string }) =>
      api.post<OpsZone>("/api/zones", input),
    onSuccess: invalidate,
  });
}

export function useUpdateZone() {
  const invalidate = useInvalidateZones();
  return useMutation({
    mutationFn: ({
      zoneId,
      ...changes
    }: {
      zoneId: string;
      name?: string;
      is_active?: boolean;
    }) =>
      api.patch<{ zone: OpsZone; affected_addresses: number }>(
        `/api/zones/${zoneId}`,
        changes
      ),
    onSuccess: invalidate,
  });
}

export function useTransferZone() {
  const invalidate = useInvalidateZones();
  return useMutation({
    mutationFn: ({ zoneId, distributorId }: { zoneId: string; distributorId: string }) =>
      api.patch<OpsZone>(`/api/zones/${zoneId}/transfer`, { distributor_id: distributorId }),
    onSuccess: invalidate,
  });
}

export function useAddCoverage() {
  const invalidate = useInvalidateZones();
  return useMutation({
    mutationFn: ({ zoneId, entry }: { zoneId: string; entry: CoverageEntry }) =>
      api.post<{ coverage: ZoneCoverage; warnings: CoverageOverlapWarning[] }>(
        `/api/zones/${zoneId}/coverage`,
        entry
      ),
    onSuccess: invalidate,
  });
}

export function useAddCoverageBulk() {
  const invalidate = useInvalidateZones();
  return useMutation({
    mutationFn: ({ zoneId, items }: { zoneId: string; items: CoverageEntry[] }) =>
      api.post<CoverageBulkResult>(`/api/zones/${zoneId}/coverage/bulk`, { items }),
    onSuccess: invalidate,
  });
}

/** Checagem sem gravar — alimenta o preview antes de confirmar o import. */
export function usePreviewCoverage() {
  return useMutation({
    mutationFn: ({ zoneId, items }: { zoneId: string; items: CoverageEntry[] }) =>
      api.post<CoveragePreview>(`/api/zones/${zoneId}/coverage/preview`, { items }),
  });
}

export function useRemoveCoverage() {
  const invalidate = useInvalidateZones();
  return useMutation({
    mutationFn: ({ zoneId, coverageId }: { zoneId: string; coverageId: string }) =>
      api.delete<void>(`/api/zones/${zoneId}/coverage?coverageId=${coverageId}`),
    onSuccess: invalidate,
  });
}
