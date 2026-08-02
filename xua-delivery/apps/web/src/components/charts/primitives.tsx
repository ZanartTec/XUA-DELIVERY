"use client";

import { memo } from "react";
import {
  Area,
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_FORMATTERS,
  AXIS_PROPS,
  CHART_COLORS,
  CHART_MARGIN,
  CHART_PALETTE,
  GRID_PROPS,
  VALUE_FORMATTERS,
  formatDayShort,
  type ChartValueFormat,
} from "./chart-theme";

/**
 * Único arquivo do app que importa Recharts. É carregado sob demanda pelo
 * barrel (`./index.tsx`), então a biblioteca não entra no bundle inicial.
 *
 * Três primitivos cobrem todos os gráficos do sistema — a intenção é que
 * continue assim: prefira estender a API destes a criar um quarto wrapper.
 */

export interface ChartSeries {
  /** Campo do dado que alimenta a série. */
  key: string;
  label: string;
  color?: string;
  /** Só no TimeSeriesChart. Padrão: "line". */
  type?: "line" | "area";
}

export interface ChartTarget {
  value: number;
  label: string;
  color?: string;
}

/**
 * Ponto de dado de um gráfico.
 *
 * O valor é `any` de propósito: `Record<string, unknown>` rejeitaria os tipos
 * do contrato (`KpiSeriesPoint`, `KpiFunnelStage`, …), porque interfaces não
 * ganham index signature implícita em TypeScript. Cada gráfico continua
 * tipando as próprias séries pelos `key` que declara.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChartDatum = Record<string, any>;

// ─── Tooltip compartilhado ───────────────────────────────────────

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  format,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format: ChartValueFormat;
  labelFormatter?: (value: string) => string;
}) {
  if (!active || !payload?.length) return null;

  const formatValue = VALUE_FORMATTERS[format];
  const heading = labelFormatter ? labelFormatter(String(label ?? "")) : String(label ?? "");

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-popover-foreground">{heading}</p>
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li
            key={`${entry.dataKey ?? index}`}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span>{entry.name}</span>
            <span className="ml-auto font-semibold text-popover-foreground">
              {typeof entry.value === "number" ? formatValue(entry.value) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LEGEND_STYLE = { fontSize: 11, paddingTop: 8 } as const;

function seriesColor(series: ChartSeries, index: number): string {
  return series.color ?? CHART_PALETTE[index % CHART_PALETTE.length];
}

function renderTargets(targets: ChartTarget[] | undefined) {
  return targets?.map((target) => (
    <ReferenceLine
      key={target.label}
      y={target.value}
      stroke={target.color ?? CHART_COLORS.target}
      strokeDasharray="6 3"
      label={{
        value: target.label,
        position: "right",
        fontSize: 10,
        fill: target.color ?? CHART_COLORS.target,
      }}
    />
  ));
}

// ─── TimeSeriesChart ─────────────────────────────────────────────

export interface TimeSeriesChartProps {
  data: ChartDatum[];
  /** Campo do eixo X. Datas ISO ganham rótulo "dd/MM" automaticamente. */
  xKey: string;
  series: ChartSeries[];
  targets?: ChartTarget[];
  yDomain?: [number | "auto", number | "auto"];
  format?: ChartValueFormat;
  showLegend?: boolean;
}

/** Evolução ao longo do tempo — uma ou mais séries, linha ou área. */
export const TimeSeriesChart = memo(function TimeSeriesChart({
  data,
  xKey,
  series,
  targets,
  yDomain = ["auto", "auto"],
  format = "percent",
  showLegend = true,
}: TimeSeriesChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey={xKey} tickFormatter={formatDayShort} minTickGap={16} {...AXIS_PROPS} />
        <YAxis domain={yDomain} tickFormatter={AXIS_FORMATTERS[format]} width={44} {...AXIS_PROPS} />
        <Tooltip
          cursor={{ stroke: CHART_COLORS.grid }}
          content={
            <ChartTooltipContent format={format} labelFormatter={formatDayShort} />
          }
        />
        {showLegend && series.length > 1 && <Legend wrapperStyle={LEGEND_STYLE} />}
        {renderTargets(targets)}

        {series.map((s, index) => {
          const color = seriesColor(s, index);

          return s.type === "area" ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              fill={color}
              fillOpacity={0.18}
              strokeWidth={2}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

// ─── CategoryBarChart ────────────────────────────────────────────

export interface CategoryBarChartProps {
  data: ChartDatum[];
  /** Campo que rotula cada barra. */
  categoryKey: string;
  series: ChartSeries[];
  /** "columns" = barras em pé (padrão); "bars" = barras deitadas. */
  layout?: "columns" | "bars";
  target?: ChartTarget;
  format?: ChartValueFormat;
  /** Colore cada barra individualmente — usado no funil e no histograma. */
  colorByPoint?: (datum: ChartDatum, index: number) => string;
  /** Largura do eixo de categorias no modo "bars" (rótulos longos). */
  categoryWidth?: number;
  domain?: [number | "auto", number | "auto"];
}

/** Comparação entre categorias — ranking, funil, histograma, NPS. */
export const CategoryBarChart = memo(function CategoryBarChart({
  data,
  categoryKey,
  series,
  layout = "columns",
  target,
  format = "percent",
  colorByPoint,
  categoryWidth = 110,
  domain = ["auto", "auto"],
}: CategoryBarChartProps) {
  const isBars = layout === "bars";
  const valueAxis = {
    type: "number" as const,
    domain,
    tickFormatter: AXIS_FORMATTERS[format],
  };
  const categoryAxis = {
    type: "category" as const,
    dataKey: categoryKey,
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        layout={isBars ? "vertical" : "horizontal"}
        margin={CHART_MARGIN}
      >
        <CartesianGrid {...GRID_PROPS} vertical={isBars} horizontal={!isBars} />
        <XAxis
          {...(isBars ? valueAxis : categoryAxis)}
          interval={0}
          {...AXIS_PROPS}
        />
        <YAxis
          {...(isBars ? categoryAxis : valueAxis)}
          width={isBars ? categoryWidth : 44}
          interval={0}
          {...AXIS_PROPS}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
          content={<ChartTooltipContent format={format} />}
        />
        {series.length > 1 && <Legend wrapperStyle={LEGEND_STYLE} />}
        {target &&
          (isBars ? (
            <ReferenceLine
              x={target.value}
              stroke={target.color ?? CHART_COLORS.target}
              strokeDasharray="6 3"
              label={{
                value: target.label,
                position: "top",
                fontSize: 10,
                fill: target.color ?? CHART_COLORS.target,
              }}
            />
          ) : (
            renderTargets([target])
          ))}

        {series.map((s, index) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={seriesColor(s, index)}
            radius={isBars ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            maxBarSize={isBars ? 22 : 48}
          >
            {colorByPoint &&
              data.map((datum, pointIndex) => (
                <Cell
                  key={`${s.key}-${pointIndex}`}
                  fill={colorByPoint(datum, pointIndex)}
                />
              ))}
          </Bar>
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

// ─── Sparkline ───────────────────────────────────────────────────

export interface SparklineProps {
  data: ChartDatum[];
  dataKey: string;
  color?: string;
  height?: number;
}

/** Linha mínima, sem eixos nem grid — para dentro de cards de KPI. */
export const Sparkline = memo(function Sparkline({
  data,
  dataKey,
  color = CHART_COLORS.primary,
  height = 36,
}: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
