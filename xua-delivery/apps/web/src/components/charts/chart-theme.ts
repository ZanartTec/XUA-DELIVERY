/**
 * Tokens e formatadores compartilhados por todos os gráficos.
 *
 * As cores são CSS custom properties (não hex): o Recharts as aplica direto nos
 * atributos do SVG, então o tema escuro de globals.css passa a valer sem
 * nenhum código condicional.
 */

/** Paleta categórica — segue a ordem dos tokens --chart-1..5 do design system. */
export const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** Cores semânticas — mesma fonte usada pelos semáforos de status. */
export const CHART_COLORS = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  primary: "var(--primary)",
  accent: "var(--accent)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  target: "var(--destructive)",
} as const;

/** Cor de cada um dos três KPIs canônicos, estável entre telas. */
export const KPI_COLORS = {
  sla: CHART_COLORS.success,
  acceptance: "var(--chart-2)",
  redelivery: CHART_COLORS.warning,
} as const;

export const CHART_MARGIN = { top: 8, right: 16, bottom: 4, left: 0 } as const;

export const AXIS_PROPS = {
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: CHART_COLORS.grid,
  vertical: false,
} as const;

/** Altura padrão de um gráfico dentro do ChartFrame. */
export const CHART_HEIGHT = 220;

// ─── Formatadores (pt-BR) ────────────────────────────────────────

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const intFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});
const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

export function formatInt(value: number): string {
  return intFormatter.format(value);
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

/** "2026-08-02" → "02/08". Tolera rótulos que não sejam data. */
export function formatDayShort(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

export type ChartValueFormat = "percent" | "int" | "decimal";

export const VALUE_FORMATTERS: Record<ChartValueFormat, (v: number) => string> = {
  percent: formatPercent,
  int: formatInt,
  decimal: formatDecimal,
};

/** Formatador do eixo Y — compacto para contagens, curto para percentuais. */
export const AXIS_FORMATTERS: Record<ChartValueFormat, (v: number) => string> = {
  percent: (v) => `${Math.round(v)}%`,
  int: formatCompact,
  decimal: formatDecimal,
};
