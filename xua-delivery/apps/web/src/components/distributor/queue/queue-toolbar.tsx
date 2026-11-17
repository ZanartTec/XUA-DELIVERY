"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { cn } from "@/src/lib/utils";
import type { QueueTabValue, QueueView } from "./queue-model";

export interface QueueTab {
  value: QueueTabValue;
  label: string;
  count: number | null;
}

interface QueueTabsProps {
  tabs: readonly QueueTab[];
  value: QueueTabValue;
  onChange: (value: QueueTabValue) => void;
  /** `pill` no celular (abas roláveis); `line` no desktop (sublinhado, como o resto do painel). */
  variant: "pill" | "line";
}

/** Abas por etapa, com contador. O contador de "Novos" ganha destaque quando há pedido esperando. */
export function QueueTabs({ tabs, value, onChange, variant }: QueueTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as QueueTabValue)}>
      <TabsList
        variant={variant === "line" ? "line" : "default"}
        className={cn(
          variant === "pill"
            ? "h-11 w-full justify-start overflow-x-auto [scrollbar-width:none]"
            : "h-10 gap-1 p-0 group-data-horizontal/tabs:h-10",
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className={cn(
              "shrink-0 gap-1.5",
              variant === "pill"
                ? "h-9 px-3"
                : "h-10 flex-none px-3 after:bg-primary group-data-horizontal/tabs:after:bottom-[-1px]",
            )}>
            {tab.label}
            {tab.count != null ? (
              <span
                className={cn(
                  "rounded-md px-1.5 text-[11px] tabular-nums",
                  tab.value === "incoming" && tab.count > 0 ? "bg-warning text-white" : "text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

export function QueueSearch({ value, onChange, className, inputClassName }: SearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar pedido, cliente, bairro…"
        aria-label="Buscar pedidos"
        className={cn("pl-9", inputClassName)}
      />
    </div>
  );
}

interface QueueToolbarProps {
  tabs: readonly QueueTab[];
  activeTab: QueueTabValue;
  onTabChange: (value: QueueTabValue) => void;
  view: QueueView;
  onViewChange: (view: QueueView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Controles de filtro (já em layout inline). */
  filters: ReactNode;
  hasActiveFilters: boolean;
  onClear: () => void;
}

/** Barra de ferramentas do desktop: abas + visão (quadro/lista) em cima; busca e filtros embaixo. */
export function QueueToolbar(props: QueueToolbarProps) {
  const { tabs, activeTab, onTabChange, view, onViewChange, search, onSearchChange, filters, hasActiveFilters, onClear } = props;
  return (
    <div className="hidden space-y-3 md:block">
      <div className="flex items-end justify-between gap-3 border-b border-hairline">
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
          <QueueTabs tabs={tabs} value={activeTab} onChange={onTabChange} variant="line" />
        </div>
        {activeTab === "all" ? (
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(next) => (next === "board" || next === "list") && onViewChange(next)}
            aria-label="Visão dos pedidos"
            className="mb-1.5"
          >
            <ToggleGroupItem value="board" aria-label="Quadro por etapa" className="h-8 gap-1.5 px-3 text-[13px]">
              <LayoutGrid className="size-4" aria-hidden /> Quadro
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Lista" className="h-8 gap-1.5 px-3 text-[13px]">
              <List className="size-4" aria-hidden /> Lista
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <QueueSearch value={search} onChange={onSearchChange} className="min-w-52 max-w-80 flex-1" inputClassName="h-9 rounded-lg" />
        {filters}
        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
            <X aria-hidden /> Limpar filtros
          </Button>
        ) : null}
      </div>
    </div>
  );
}
