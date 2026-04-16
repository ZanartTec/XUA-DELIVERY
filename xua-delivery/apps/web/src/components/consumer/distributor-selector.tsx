"use client";

import { useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";
import { Building2, Star, CalendarDays, Loader2 } from "lucide-react";

interface AvailableDistributor {
  id: string;
  name: string;
  avg_nps: number | null;
  next_available_date: string | null;
}

interface DistributorSelectorProps {
  zoneId: string;
  date: string;
  window: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSkip: () => void;
}

export function DistributorSelector({
  zoneId,
  date,
  window: deliveryWindow,
  selectedId,
  onSelect,
  onSkip,
}: DistributorSelectorProps) {
  const [distributors, setDistributors] = useState<AvailableDistributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          zone_id: zoneId,
          date,
          window: deliveryWindow,
        });
        const res = await fetch(`/api/distributors?${params}`);
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Erro ao buscar distribuidoras");
        }
        const body = await res.json();
        if (cancelled) return;

        const list: AvailableDistributor[] = body.distributors ?? [];
        setDistributors(list);

        // Se não há opção de escolha (0 ou 1), pular automaticamente
        if (list.length <= 1) {
          onSkip();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro de conexão");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [zoneId, date, deliveryWindow, onSkip]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-4 mx-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (distributors.length <= 1) return null;

  return (
    <div className="space-y-3">
      {distributors.map((d) => {
        const isSelected = selectedId === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d.id)}
            className={cn(
              "flex w-full items-start gap-4 rounded-2xl p-4 transition-all active:scale-[0.98]",
              isSelected
                ? "bg-white border-2 border-[#C8F708] shadow-[0_2px_12px_rgba(200,247,8,0.15)]"
                : "bg-white border border-[#e1e3e4] hover:border-primary/30",
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                isSelected ? "bg-[#C8F708]/15" : "bg-[#5697E9]/15",
              )}
            >
              <Building2
                className={cn(
                  "h-5 w-5",
                  isSelected ? "text-[#1a2600]" : "text-[#5697E9]",
                )}
              />
            </div>

            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold text-[#191c1d]">{d.name}</p>

              <div className="flex items-center gap-3 mt-1.5">
                {d.avg_nps !== null && (
                  <span className="flex items-center gap-1 text-xs text-[#737688]">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    {d.avg_nps.toFixed(1)}
                  </span>
                )}
                {d.next_available_date && (
                  <span className="flex items-center gap-1 text-xs text-[#737688]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(d.next_available_date + "T12:00:00").toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "short" },
                    )}
                  </span>
                )}
              </div>
            </div>

            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors mt-1",
                isSelected
                  ? "border-[#C8F708] bg-[#C8F708]"
                  : "border-[#c4c6cf] bg-transparent",
              )}
            >
              {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
