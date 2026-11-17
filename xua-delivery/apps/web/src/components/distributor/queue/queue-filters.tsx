"use client";

import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import type { DistributorDriver } from "@/src/hooks/distributor/use-distributor-drivers";
import { isQueueOrigin, isQueueSort, type QueueFilterValues, type QueueTabValue } from "./queue-model";

interface QueueFilterFieldsProps extends QueueFilterValues {
  drivers: readonly DistributorDriver[];
  activeTab: QueueTabValue;
  onChange: (updates: Record<string, string | null>) => void;
  /** `inline`: uma linha de controles compactos (desktop). `stack`: campos com rótulo (diálogo do celular). */
  layout: "inline" | "stack";
}

const ORIGIN_OPTIONS = [
  { value: "all", label: "Todas as origens" },
  { value: "cart", label: "Avulso" },
  { value: "subscription", label: "Assinatura" },
] as const;

/** Data de entrega, motorista, origem e ordenação. Os mesmos campos servem à barra do desktop e ao diálogo. */
export function QueueFilterFields(props: QueueFilterFieldsProps) {
  const { layout, drivers, activeTab, deliveryDate, driverId, origin, sort, onChange } = props;
  const inline = layout === "inline";
  const triggerClass = inline ? "h-9" : "h-11 w-full";

  const date = (
    <Input
      id="f-date"
      type="date"
      aria-label="Data de entrega"
      value={deliveryDate}
      onChange={(e) => onChange({ deliveryDate: e.target.value || null })}
      className={inline ? "h-9 w-36" : "h-11"}
    />
  );

  const driver = (
    <Select value={driverId} onValueChange={(value) => onChange({ driverId: value })}>
      <SelectTrigger className={inline ? "h-9 w-44" : triggerClass} aria-label="Motorista">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os motoristas</SelectItem>
        <SelectItem value="unassigned">Sem motorista</SelectItem>
        {drivers.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const sortSelect = (
    <Select value={sort} onValueChange={(value) => isQueueSort(value) && onChange({ sort: value })}>
      <SelectTrigger className={inline ? "h-9 w-40" : triggerClass} aria-label="Ordenar por">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="created_desc">Mais recentes</SelectItem>
        <SelectItem value="delivery_asc">Entrega mais próxima</SelectItem>
        {activeTab !== "history" ? <SelectItem value="sla_asc">Prazo de resposta</SelectItem> : null}
      </SelectContent>
    </Select>
  );

  if (inline) {
    const originSelect = (
      <Select value={origin} onValueChange={(value) => isQueueOrigin(value) && onChange({ origin: value })}>
        <SelectTrigger className="h-9 w-40" aria-label="Origem">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORIGIN_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
    return (
      <>
        {date}
        {driver}
        {originSelect}
        {sortSelect}
      </>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="f-date">Data de entrega</Label>
        {date}
      </div>
      <div className="grid gap-1.5">
        <Label>Motorista</Label>
        {driver}
      </div>
      <div className="grid gap-1.5">
        <Label>Origem</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={origin}
          onValueChange={(v) => isQueueOrigin(v) && onChange({ origin: v })}
          className="grid w-full grid-cols-3"
        >
          <ToggleGroupItem value="all" className="h-11 md:h-9">Todos</ToggleGroupItem>
          <ToggleGroupItem value="cart" className="h-11 md:h-9">Avulso</ToggleGroupItem>
          <ToggleGroupItem value="subscription" className="h-11 md:h-9">Assinatura</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid gap-1.5">
        <Label>Ordenar por</Label>
        {sortSelect}
      </div>
    </div>
  );
}
