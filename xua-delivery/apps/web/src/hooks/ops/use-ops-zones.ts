"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ZoneCoverage {
  id: string;
  neighborhood: string | null;
  zip_code: string | null;
}

export interface OpsZone {
  id: string;
  name: string;
  distributor_id: string;
  is_active: boolean;
  coverage: ZoneCoverage[];
  distributor: { id: string; name: string; is_active: boolean };
  _count: { addresses: number; orders: number };
}

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

const zonesKey = (distributorId: string | null, includeInactive: boolean) =>
  ["ops-zones", distributorId, includeInactive] as const;

/** Toda mutação de zona invalida a árvore inteira — é barato e evita lista stale. */
function useInvalidateZones() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["ops-zones"] });
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

export function useOpsZones(distributorId: string | null, includeInactive: boolean) {
  const query = useQuery<{ zones: OpsZone[] }>({
    queryKey: zonesKey(distributorId, includeInactive),
    queryFn: () => {
      const params = new URLSearchParams();
      if (distributorId) params.set("distributor_id", distributorId);
      if (includeInactive) params.set("include_inactive", "true");
      return api.get<{ zones: OpsZone[] }>(`/api/zones/all?${params}`);
    },
    enabled: Boolean(distributorId),
    staleTime: 30_000,
  });

  return {
    zones: query.data?.zones ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
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
