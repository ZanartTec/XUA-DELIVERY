"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "./chart-frame";

/**
 * Ponto de entrada da biblioteca de gráficos.
 *
 * Os primitivos são carregados sob demanda: o Recharts fica num chunk próprio e
 * só é baixado quando um gráfico realmente monta na tela — as demais rotas não
 * pagam por ele. `ssr: false` porque a renderização depende de medir o
 * container, o que não existe no servidor.
 */

const loading = () => <ChartSkeleton />;

export const TimeSeriesChart = dynamic(
  () => import("./primitives").then((m) => m.TimeSeriesChart),
  { ssr: false, loading }
);

export const CategoryBarChart = dynamic(
  () => import("./primitives").then((m) => m.CategoryBarChart),
  { ssr: false, loading }
);

export const Sparkline = dynamic(
  () => import("./primitives").then((m) => m.Sparkline),
  { ssr: false, loading: () => <ChartSkeleton height={36} /> }
);

// Sem dependência do Recharts — exportados direto, custo zero no bundle.
export { ChartFrame, ChartSkeleton } from "./chart-frame";
export * from "./chart-theme";
export type {
  ChartDatum,
  ChartSeries,
  ChartTarget,
  TimeSeriesChartProps,
  CategoryBarChartProps,
  SparklineProps,
} from "./primitives";
