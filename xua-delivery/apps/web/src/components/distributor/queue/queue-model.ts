import type { Order } from "@/src/types";
import { OrderStatus } from "@/src/types/enums";

/** Tela de operação do distribuidor (/distributor/queue): tipos, etapas e montagem da consulta. */

export const PAGE_SIZE = 30;

export type QueueTabValue = "all" | "incoming" | "preparation" | "route" | "history";
export type QueueOrigin = "all" | "cart" | "subscription";
export type QueueSort = "created_desc" | "delivery_asc" | "sla_asc";
/** Visão da aba "Todos" no desktop: quadro por etapa ou lista corrida. */
export type QueueView = "board" | "list";
export type QuickAction = "accept" | "reject";

export interface QueueOrder extends Order {
  consumer_name: string;
  address_summary: string;
  total_items_qty: number;
  item_summary: string;
  driver_name?: string | null;
  sla_deadline: string;
  order_origin?: "cart" | "subscription";
}

export interface QueueSummary {
  active: number;
  incoming: number;
  preparation: number;
  route: number;
  overdue: number;
}

export interface QueueResponse {
  orders: QueueOrder[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  summary: QueueSummary;
}

/** Coluna do quadro: os primeiros pedidos da etapa e o total real (pode ser maior que `orders`). */
export interface QueueBoardColumn {
  orders: QueueOrder[];
  total: number;
}

export type QueueBoardStage = "incoming" | "preparation" | "route";

export interface QueueBoardResponse {
  columns: Record<QueueBoardStage, QueueBoardColumn>;
  perColumn: number;
  summary: QueueSummary;
}

/** Quantos pedidos cada coluna do quadro pede ao backend; o resto fica na lista da etapa. */
export const BOARD_PER_COLUMN = 12;

export const SUMMARY_FALLBACK: QueueSummary = { active: 0, incoming: 0, preparation: 0, route: 0, overdue: 0 };

export const STAGES = [
  {
    key: "incoming",
    label: "Novos",
    hint: "Aceitar ou recusar",
    statuses: [OrderStatus.SENT_TO_DISTRIBUTOR] as const,
  },
  {
    key: "preparation",
    label: "Preparo",
    hint: "Separar e despachar",
    statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.PICKING, OrderStatus.READY_FOR_DISPATCH] as const,
  },
  {
    key: "route",
    label: "Em rota",
    hint: "Com o motorista",
    statuses: [OrderStatus.OUT_FOR_DELIVERY] as const,
  },
] as const;

export const isQueueTab = (v: string | null): v is QueueTabValue =>
  v === "all" || v === "incoming" || v === "preparation" || v === "route" || v === "history";
export const isQueueOrigin = (v: string | null): v is QueueOrigin => v === "all" || v === "cart" || v === "subscription";
export const isQueueSort = (v: string | null): v is QueueSort =>
  v === "created_desc" || v === "delivery_asc" || v === "sla_asc";

export function parsePage(value: string | null) {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function shortAddress(address: string) {
  const [streetAndNumber, neighborhood] = address.split(" - ");
  return neighborhood ? `${streetAndNumber} · ${neighborhood}` : streetAndNumber || address;
}

interface QueueFilterQuery {
  q: string;
  origin: QueueOrigin;
  deliveryDate: string;
  driverId: string;
  sort: QueueSort;
}

/** Filtros que a lista e o quadro compartilham. Valor "padrão" não vai na URL. */
function appendFilters(params: URLSearchParams, input: QueueFilterQuery) {
  params.set("sort", input.sort);
  if (input.q) params.set("q", input.q);
  if (input.origin !== "all") params.set("origin", input.origin);
  if (input.deliveryDate) params.set("deliveryDate", input.deliveryDate);
  if (input.driverId !== "all") params.set("driverId", input.driverId);
}

/** Uma página da lista de uma etapa (os filtros e a paginação são resolvidos no banco). */
export function buildQueueQuery(input: QueueFilterQuery & { stage: QueueTabValue; page: number }) {
  const params = new URLSearchParams({
    scope: "distributor",
    stage: input.stage,
    page: String(input.page),
    limit: String(PAGE_SIZE),
  });
  appendFilters(params, input);
  return params.toString();
}

/** As três etapas ativas numa consulta só: cada coluna já vem separada e com o total real. */
export function buildBoardQuery(input: QueueFilterQuery) {
  const params = new URLSearchParams({
    scope: "distributor",
    view: "board",
    perColumn: String(BOARD_PER_COLUMN),
  });
  appendFilters(params, input);
  return params.toString();
}

export interface QueueFilterValues {
  origin: QueueOrigin;
  deliveryDate: string;
  driverId: string;
  sort: QueueSort;
}

/** Quantos filtros (além da busca e da aba) estão ativos. */
export function countActiveFilters({ origin, deliveryDate, driverId, sort }: QueueFilterValues): number {
  return [origin !== "all", Boolean(deliveryDate), driverId !== "all", sort !== "created_desc"].filter(Boolean).length;
}

/** Ações que o pedido pede, pela etapa: novo = aceitar/recusar; preparo = separar e despachar. */
export function isIncoming(order: Pick<QueueOrder, "status">): boolean {
  return order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
}

export function isInPreparation(order: Pick<QueueOrder, "status">): boolean {
  return (STAGES[1].statuses as readonly string[]).includes(order.status);
}
