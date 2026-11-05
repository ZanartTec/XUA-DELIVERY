"use client";

import { useEffect, useEffectEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { Building2, CalendarDays, Star } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Skeleton } from "@/src/components/ui/skeleton";
import { isoDayToDate } from "@/src/lib/datetime";
import { cn } from "@/src/lib/utils";

interface AvailableDistributor {
  id: string;
  name: string;
  avg_nps: number | null;
  next_available_date: string | null;
}

interface DistributorSelectorProps {
  zoneId: string;
  date?: string;
  window?: string;
  selectedId: string | null;
  /** `null` quando a seleção atual deixou de valer (ex.: trocou o endereço). */
  onSelect: (id: string | null) => void;
}

function formatNextDate(iso: string) {
  return isoDayToDate(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/**
 * Quem entrega. Com uma única distribuidora atendendo, ela já vem escolhida e o
 * card é só informativo (sem etapa extra para o cliente).
 */
export function DistributorSelector({ zoneId, date, window: deliveryWindow, selectedId, onSelect }: DistributorSelectorProps) {
  const params = new URLSearchParams({ zone_id: zoneId });
  if (date) params.set("date", date);
  if (deliveryWindow) params.set("window", deliveryWindow);
  const query = useQuery({
    queryKey: ["distributors", zoneId, date ?? null, deliveryWindow ?? null],
    queryFn: async () =>
      (await api.get<{ distributors?: AvailableDistributor[] }>(`/api/distributors?${params}`)).distributors ?? [],
  });
  const distributors = query.data ?? [];
  const loading = query.isLoading;
  const error = query.error ? (query.error instanceof Error ? query.error.message : "Erro de conexão") : null;

  // Mantém a seleção coerente com a lista carregada (única → escolhida; sumiu → limpa).
  const reconcileSelection = useEffectEvent((list: AvailableDistributor[]) => {
    if (list.length === 1) {
      if (selectedId !== list[0].id) onSelect(list[0].id);
    } else if (selectedId && !list.some((d) => d.id === selectedId)) {
      onSelect(null);
    }
  });

  useEffect(() => {
    if (query.data) reconcileSelection(query.data);
  }, [query.data]);

  if (loading) return <Skeleton className="h-18 rounded-2xl" />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (distributors.length === 0) {
    return (
      <Alert className="border-warning/30 bg-warning-surface text-warning-foreground">
        <AlertDescription className="text-warning-foreground">
          Nenhuma distribuidora atende este endereço agora. Tente outro endereço de entrega.
        </AlertDescription>
      </Alert>
    );
  }

  if (distributors.length === 1) {
    return <DistributorInfo distributor={distributors[0]} />;
  }

  return (
    <RadioGroup value={selectedId ?? ""} onValueChange={(id) => onSelect(id)} aria-label="Distribuidoras">
      {distributors.map((d) => {
        const checked = d.id === selectedId;
        return (
          <Label
            key={d.id}
            htmlFor={`dist-${d.id}`}
            className={cn(
              "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 font-normal transition-colors",
              checked ? "border-primary ring-1 ring-primary" : "border-hairline hover:border-primary/40",
            )}
          >
            <DistributorInfo distributor={d} bare />
            <RadioGroupItem id={`dist-${d.id}`} value={d.id} aria-label={d.name} />
          </Label>
        );
      })}
    </RadioGroup>
  );
}

function DistributorInfo({ distributor: d, bare = false }: { distributor: AvailableDistributor; bare?: boolean }) {
  const content = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky/10">
        <Building2 className="size-5 text-primary" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{d.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {d.avg_nps !== null ? (
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-warning text-warning" aria-hidden />
              {d.avg_nps.toFixed(1)}
            </span>
          ) : null}
          {d.next_available_date ? (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              Próxima entrega {formatNextDate(d.next_available_date)}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
  if (bare) return content;
  return <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3">{content}</div>;
}
