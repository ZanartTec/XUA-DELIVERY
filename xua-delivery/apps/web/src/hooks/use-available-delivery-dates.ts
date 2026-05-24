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

export function useAvailableDeliveryDates({
  zoneId,
  distributorId,
  days = DEFAULT_DAYS_AHEAD,
  enabled = true,
}: UseAvailableDeliveryDatesOptions) {
  const [availableDates, setAvailableDates] = useState<AvailableDeliveryDate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !zoneId) {
      setAvailableDates(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ days: String(normalizeDays(days)) });
    if (distributorId) params.set("distributor_id", distributorId);

    setLoading(true);
    setError(null);

    fetch(`/api/zones/${encodeURIComponent(zoneId)}/available-dates?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
        if (!cancelled) setAvailableDates((data.dates ?? []) as AvailableDeliveryDate[]);
      })
      .catch((err) => {
        if (!cancelled) {
          setAvailableDates(null);
          setError(err instanceof Error ? err.message : "Erro ao carregar datas");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [zoneId, distributorId, days, enabled]);

  return { availableDates, loading, error };
}