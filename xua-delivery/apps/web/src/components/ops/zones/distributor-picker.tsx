"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronRight, Search } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";
import type { DistributorOption } from "@/src/hooks/ops/use-ops-zones";
import { OPS_CARD, OPS_INPUT } from "./styles";

interface DistributorPickerProps {
  distributors: DistributorOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export function DistributorPicker({
  distributors,
  selectedId,
  onSelect,
  isLoading,
}: DistributorPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return distributors;
    return distributors.filter((d) => d.name.toLowerCase().includes(term));
  }, [distributors, search]);

  return (
    <div className={cn(OPS_CARD, "p-4 space-y-3")}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#5697E9]/10">
          <Building2 className="h-3.5 w-3.5 text-[#5697E9]" />
        </span>
        <p className="text-sm font-semibold font-heading">Distribuidoras</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar distribuidora"
          className={cn(OPS_INPUT, "pl-8")}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-xl bg-[#e1e3e4]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhuma distribuidora encontrada.
        </p>
      ) : (
        <ul className="space-y-1">
          {filtered.map((distributor) => {
            const isSelected = distributor.id === selectedId;
            return (
              <li key={distributor.id}>
                <button
                  type="button"
                  onClick={() => onSelect(distributor.id)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    isSelected
                      ? "bg-[#00E0FF]/15 font-semibold text-[#001735]"
                      : "hover:bg-[#e1e3e4]/60",
                    !distributor.is_active && "opacity-60"
                  )}
                >
                  <span className="truncate">{distributor.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {!distributor.is_active && (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                        Inativa
                      </span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
