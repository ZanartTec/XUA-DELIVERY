"use client";

import type { ReactNode } from "react";
import { KPI_TARGETS } from "@xua/shared/constants/kpi";
import type { KpiOverview } from "@xua/shared/types";

import {
  CategoryBarChart,
  CHART_COLORS,
  KPI_COLORS,
  TimeSeriesChart,
} from "@/src/components/charts";
import { RankingChart } from "./ranking-chart";

/**
 * Registro dos gráficos do painel de OPS.
 *
 * A página apenas percorre este array — adicionar um gráfico é acrescentar uma
 * entrada, removê-lo é apagar a entrada (ou marcar `enabled: false`). Nenhuma
 * mudança na página é necessária em nenhum dos dois casos.
 */

export interface OpsDashboardContext {
  overview: KpiOverview;
  /** Distribuidora em drill-down; string vazia = visão global. */
  selectedDistributor: string;
}

export interface OpsChartDef {
  id: string;
  title: string;
  description?: string;
  /** "full" ocupa a linha inteira no desktop. */
  span: "full" | "half";
  enabled: boolean;
  /** Mostra o estado vazio em vez de um gráfico sem dado. */
  isEmpty: (ctx: OpsDashboardContext) => boolean;
  /**
   * Retira o gráfico do grid — para os que não fazem sentido em drill-down.
   * Recebe só `selectedDistributor`, não o overview: precisa ser decidível
   * antes dos dados chegarem, para a página saber quantos esqueletos mostrar
   * no primeiro carregamento sem o grid "encolher" quando a resposta chega.
   */
  isHidden?: (selectedDistributor: string) => boolean;
  render: (ctx: OpsDashboardContext) => ReactNode;
}

const hasNoOrders = (ctx: OpsDashboardContext) =>
  ctx.overview.summary.orders_received === 0;

const isDrillDown = (selectedDistributor: string) => Boolean(selectedDistributor);

export const OPS_CHARTS: OpsChartDef[] = [
  {
    id: "kpi-trend",
    title: "Evolução dos KPIs",
    description: "SLA de aceite, taxa de aceite e reentrega por dia, contra as metas.",
    span: "full",
    enabled: true,
    isEmpty: (ctx) => ctx.overview.series.length === 0,
    render: ({ overview }) => (
      <TimeSeriesChart
        data={overview.series}
        xKey="date"
        yDomain={[0, 100]}
        format="percent"
        series={[
          { key: "sla_pct", label: "SLA de aceite", color: KPI_COLORS.sla },
          { key: "acceptance_pct", label: "Taxa de aceite", color: KPI_COLORS.acceptance },
          { key: "redelivery_pct", label: "Reentrega", color: KPI_COLORS.redelivery },
        ]}
        targets={[
          { value: KPI_TARGETS.slaAcceptance, label: `Meta ${KPI_TARGETS.slaAcceptance}%`, color: KPI_COLORS.sla },
          { value: KPI_TARGETS.acceptanceRate, label: `Meta ${KPI_TARGETS.acceptanceRate}%`, color: KPI_COLORS.acceptance },
          { value: KPI_TARGETS.redeliveryRate, label: `Meta ${KPI_TARGETS.redeliveryRate}%`, color: KPI_COLORS.redelivery },
        ]}
      />
    ),
  },
  {
    id: "distributor-ranking",
    title: "Ranking por distribuidora",
    description: "Somente distribuidoras com pedidos no período.",
    span: "half",
    enabled: true,
    isHidden: isDrillDown,
    isEmpty: (ctx) =>
      ctx.overview.by_distributor.every((row) => row.orders_received === 0),
    render: ({ overview }) => <RankingChart rows={overview.by_distributor} />,
  },
  {
    id: "order-funnel",
    title: "Funil operacional",
    description: "Onde os pedidos param entre o recebimento e a entrega.",
    span: "half",
    enabled: true,
    isEmpty: (ctx) => ctx.overview.funnel.every((stage) => stage.count === 0),
    render: ({ overview }) => (
      <CategoryBarChart
        data={overview.funnel}
        categoryKey="label"
        layout="bars"
        format="int"
        domain={[0, "auto"]}
        categoryWidth={92}
        series={[{ key: "count", label: "Pedidos" }]}
        colorByPoint={(datum) =>
          datum.stage === "rejected" || datum.stage === "redelivery"
            ? CHART_COLORS.danger
            : CHART_COLORS.primary
        }
      />
    ),
  },
  {
    id: "acceptance-latency",
    title: "Tempo até o aceite",
    description: "Distribuição do intervalo entre recebimento e aceite.",
    span: "half",
    enabled: true,
    isEmpty: (ctx) =>
      ctx.overview.acceptance_latency.every((bucket) => bucket.count === 0),
    render: ({ overview }) => (
      <CategoryBarChart
        data={overview.acceptance_latency}
        categoryKey="bucket"
        format="int"
        domain={[0, "auto"]}
        series={[{ key: "count", label: "Pedidos" }]}
        colorByPoint={(datum) =>
          datum.within_sla ? CHART_COLORS.success : CHART_COLORS.danger
        }
      />
    ),
  },
  {
    id: "orders-volume",
    title: "Volume de pedidos",
    description: "Dá escala às taxas — 100% de SLA em dois pedidos não é o mesmo que em duzentos.",
    span: "half",
    enabled: true,
    isEmpty: hasNoOrders,
    render: ({ overview }) => (
      <TimeSeriesChart
        data={overview.series}
        xKey="date"
        format="int"
        yDomain={[0, "auto"]}
        showLegend={false}
        series={[
          {
            key: "orders_count",
            label: "Pedidos criados",
            type: "area",
            color: CHART_COLORS.primary,
          },
        ]}
      />
    ),
  },
  {
    id: "nps-by-distributor",
    title: "NPS médio",
    description: "Média das notas de pedidos entregues no período.",
    span: "half",
    enabled: true,
    isHidden: isDrillDown,
    isEmpty: (ctx) => ctx.overview.by_distributor.every((row) => row.avg_nps === null),
    render: ({ overview }) => (
      <CategoryBarChart
        data={overview.by_distributor
          .filter((row) => row.avg_nps !== null)
          .map((row) => ({ name: row.distributor_name, nps: row.avg_nps }))
          .sort((a, b) => Number(b.nps) - Number(a.nps))}
        categoryKey="name"
        layout="bars"
        format="decimal"
        domain={[0, 10]}
        series={[{ key: "nps", label: "NPS", color: "var(--chart-3)" }]}
      />
    ),
  },
];

/**
 * Gráficos a exibir para um dado `selectedDistributor`, na ordem do registro.
 * Não depende do overview ter carregado — a página usa isto tanto para o
 * grid final quanto para os esqueletos do primeiro carregamento, então a
 * contagem de cards nunca muda quando os dados chegam.
 */
export function getVisibleCharts(selectedDistributor: string): OpsChartDef[] {
  return OPS_CHARTS.filter(
    (chart) => chart.enabled && !chart.isHidden?.(selectedDistributor)
  );
}
