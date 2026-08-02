"use client";

import type { KpiStatus } from "@xua/shared/constants/kpi";
import { cn } from "@/src/lib/utils";

const STATUS_STYLES: Record<KpiStatus, { label: string; className: string }> = {
  ok: {
    label: "Dentro da meta",
    className: "bg-success-surface text-success",
  },
  warning: {
    label: "Atenção",
    className: "bg-warning-surface text-warning",
  },
  critical: {
    label: "Crítico",
    className: "bg-danger-surface text-destructive",
  },
};

/** Semáforo de KPI — compartilhado entre a tabela de OPS e os cards. */
export function KpiStatusPill({
  status,
  label,
  className,
}: {
  status: KpiStatus;
  /** Sobrescreve o texto padrão do status. */
  label?: string;
  className?: string;
}) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        style.className,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label ?? style.label}
    </span>
  );
}
