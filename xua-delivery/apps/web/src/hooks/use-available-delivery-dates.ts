"use client";

import { useEffect, useState } from "react";

export type AvailableDeliveryDate = {
  date: string;
  weekday: number;
  morning_available: boolean;
  afternoon_available: boolean;
  has_time_slots: boolean;
};

type UseAvailableDeliveryDatesOptions = {
  zoneId?: string | null;
  distributorId?: string | null;
  days?: number;
  enabled?: boolean;
};

const DEFAULT_DAYS_AHEAD = 14;
const MAX_DAYS_AHEAD = 180;

function normalizeDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_DAYS_AHEAD;
  return Math.max(1, Math.min(MAX_DAYS_AHEAD, Math.ceil(days)));
}

interface FetchResult {
  requestKey: string;
  availableDates: AvailableDeliveryDate[] | null;
  error: string | null;
}

export function useAvailableDeliveryDates({
  zoneId,
  distributorId,
  days = DEFAULT_DAYS_AHEAD,
  enabled = true,
}: UseAvailableDeliveryDatesOptions) {
  // requestKey identifica a busca atual (vazio = nada a buscar). `loading` e o
  // "resultado pertence à busca atual?" são derivados na renderização por
  // comparação com esse key — o efeito só toca estado dentro do .then()/.catch(),
  // nunca de forma síncrona no corpo dele.
  const requestKey =
    enabled && zoneId ? `${zoneId}|${distributorId ?? ""}|${normalizeDays(days)}` : "";

  const [result, setResult] = useState<FetchResult>({
    requestKey: "",
    availableDates: null,
    error: null,
  });

  useEffect(() => {
    if (!requestKey || !zoneId) return;

    let cancelled = false;
    const params = new URLSearchParams({ days: String(normalizeDays(days)) });
    if (distributorId) params.set("distributor_id", distributorId);

    fetch(`/api/zones/${encodeURIComponent(zoneId)}/available-dates?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
        if (!cancelled) {
          setResult({ requestKey, availableDates: (data.dates ?? []) as AvailableDeliveryDate[], error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            requestKey,
            availableDates: null,
            error: err instanceof Error ? err.message : "Erro ao carregar datas",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, zoneId, distributorId, days]);

  const isCurrent = requestKey !== "" && result.requestKey === requestKey;

  return {
    availableDates: isCurrent ? result.availableDates : null,
    loading: requestKey !== "" && !isCurrent,
    error: isCurrent ? result.error : null,
  };
}
