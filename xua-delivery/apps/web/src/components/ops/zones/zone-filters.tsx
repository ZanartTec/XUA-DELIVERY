"use client";

import { MapPin, Search, X } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { ZoneStatusFilter } from "@/src/hooks/ops/use-ops-zones";
import { OPS_INPUT } from "./styles";

interface ZoneFiltersBarProps {
  q: string;
  coverage: string;
  status: ZoneStatusFilter;
  onQChange: (value: string) => void;
  onCoverageChange: (value: string) => void;
  onStatusChange: (value: ZoneStatusFilter) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: { label: string; value: ZoneStatusFilter }[] = [
  { label: "Ativas", value: "active" },
  { label: "Inativas", value: "inactive" },
  { label: "Todas", value: "all" },
];

/** Todos estes filtros são resolvidos no banco — nada é filtrado no cliente. */
export function ZoneFiltersBar({
  q,
  coverage,
  status,
  onQChange,
  onCoverageChange,
  onStatusChange,
  onClear,
}: ZoneFiltersBarProps) {
  const hasFilters = q !== "" || coverage !== "" || status !== "active";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Buscar por nome da zona"
          className={cn(OPS_INPUT, "h-9 pl-8")}
        />
      </div>

      <div className="relative min-w-44 flex-1">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={coverage}
          onChange={(e) => onCoverageChange(e.target.value)}
          placeholder="Que zona atende… (bairro ou CEP)"
          className={cn(OPS_INPUT, "h-9 pl-8")}
        />
      </div>

      <div
        role="group"
        aria-label="Filtrar por status"
        className="flex shrink-0 rounded-xl bg-[#e1e3e4]/60 p-0.5"
      >
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => onStatusChange(option.value)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              status === option.value
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {hasFilters && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="h-9 shrink-0 rounded-xl text-xs"
        >
          <X className="mr-1 h-3 w-3" />
          Limpar
        </Button>
      )}
    </div>
  );
}
