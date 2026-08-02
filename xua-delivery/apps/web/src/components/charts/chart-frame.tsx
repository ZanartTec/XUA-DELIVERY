"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { CHART_HEIGHT } from "./chart-theme";

interface ChartFrameProps {
  title: string;
  description?: string;
  /** Controle no canto superior direito (toggle de métrica, seletor, etc.). */
  action?: ReactNode;
  height?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: unknown;
  emptyMessage?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Casca de todo gráfico: card do design system + estados de carregamento,
 * vazio e erro resolvidos num lugar só.
 *
 * A área do gráfico tem altura fixa nos três estados, então trocar de período
 * ou terminar de carregar não desloca o resto da página.
 */
export function ChartFrame({
  title,
  description,
  action,
  height = CHART_HEIGHT,
  isLoading = false,
  isEmpty = false,
  error,
  emptyMessage = "Sem dados no período.",
  className,
  children,
}: ChartFrameProps) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-card/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm",
        className
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>

      <div style={{ height }} className="w-full">
        {isLoading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <ChartMessage>Não foi possível carregar este gráfico.</ChartMessage>
        ) : isEmpty ? (
          <ChartMessage>{emptyMessage}</ChartMessage>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function ChartMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-muted/40">
      <p className="px-4 text-center text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** Placeholder usado tanto pelo ChartFrame quanto pelo carregamento lazy dos primitivos. */
export function ChartSkeleton({ height = CHART_HEIGHT }: { height?: number }) {
  return (
    <div
      style={{ height }}
      className="w-full animate-pulse rounded-xl bg-muted/60"
      aria-hidden
    />
  );
}
