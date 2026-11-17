"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BellRing, PackageCheck, Truck } from "lucide-react";
import { cardVariants } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";
import type { QueueSummary, QueueTabValue } from "./queue-model";

type Tone = "warning" | "info" | "neutral" | "danger";

const TONE: Record<Tone, { icon: string; ring: string }> = {
  warning: { icon: "bg-warning-surface text-warning-foreground", ring: "border-warning/50" },
  info: { icon: "bg-secondary text-primary", ring: "" },
  neutral: { icon: "bg-surface-low text-muted-foreground", ring: "" },
  danger: { icon: "bg-danger-surface text-destructive", ring: "border-destructive/40" },
};

interface MetricProps {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
  /** Pede atenção agora: borda e ícone ganham a cor do tom (warning/danger). */
  alert?: boolean;
  selected?: boolean;
  onClick: () => void;
}

function Metric({ label, value, hint, icon: Icon, tone, alert, selected, onClick }: MetricProps) {
  const palette = TONE[tone === "info" || alert ? tone : "neutral"];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cardVariants({
        variant: "interactive",
        className: cn(
          "flex items-center gap-4 p-4 text-left",
          alert && TONE[tone].ring,
          selected && "border-primary ring-1 ring-primary/30",
        ),
      })}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", palette.icon)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="block font-heading text-3xl leading-tight font-bold text-ink tabular-nums">{value}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

interface QueueSummaryCardsProps {
  summary: QueueSummary;
  activeTab: QueueTabValue;
  onSelectStage: (stage: QueueTabValue) => void;
  onSelectOverdue: () => void;
}

/** Faixa de indicadores da operação (desktop). Cada indicador filtra a fila pela etapa. */
export function QueueSummaryCards({ summary, activeTab, onSelectStage, onSelectOverdue }: QueueSummaryCardsProps) {
  return (
    <div className="hidden grid-cols-4 gap-3 md:grid" role="group" aria-label="Resumo da operação">
      <Metric
        label="Novos"
        value={summary.incoming}
        hint={summary.incoming > 0 ? "Aguardando seu aceite" : "Nenhum aguardando"}
        icon={BellRing}
        tone="warning"
        alert={summary.incoming > 0}
        selected={activeTab === "incoming"}
        onClick={() => onSelectStage("incoming")}
      />
      <Metric
        label="Em preparo"
        value={summary.preparation}
        hint="Separar e despachar"
        icon={PackageCheck}
        tone="info"
        selected={activeTab === "preparation"}
        onClick={() => onSelectStage("preparation")}
      />
      <Metric
        label="Em rota"
        value={summary.route}
        hint="Com o motorista"
        icon={Truck}
        tone="info"
        selected={activeTab === "route"}
        onClick={() => onSelectStage("route")}
      />
      <Metric
        label="Atrasados"
        value={summary.overdue}
        hint={summary.overdue > 0 ? "Entrega fora do prazo" : "Tudo no prazo"}
        icon={AlertTriangle}
        tone="danger"
        alert={summary.overdue > 0}
        onClick={onSelectOverdue}
      />
    </div>
  );
}
