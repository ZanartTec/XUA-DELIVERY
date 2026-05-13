"use client";

import { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import { DeliveryWindow, OrderStatus } from "@/src/types/enums";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import {
  ClipboardList,
  ChevronRight,
  Check,
  Truck,
  Home,
  Droplets,
} from "lucide-react";
import type { Order } from "@/src/types";
import { FilterChips, type FilterOption } from "@/src/components/shared/filter-chips";
import { Pagination } from "@/src/components/shared/pagination";

/* -- helpers -- */
const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  SENT_TO_DISTRIBUTOR: "A caminho",
  ACCEPTED_BY_DISTRIBUTOR: "A caminho",
  OUT_FOR_DELIVERY: "A caminho",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  DELIVERY_FAILED: "Falha na entrega",
};

const TERMINAL_STATUSES: string[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERY_FAILED,
  OrderStatus.REJECTED_BY_DISTRIBUTOR,
];

function getProgress(status: string) {
  const s = status as OrderStatus;
  if (s === OrderStatus.DELIVERED) return { step: 3, pct: "w-full" };
  if (
    s === OrderStatus.OUT_FOR_DELIVERY ||
    s === OrderStatus.ACCEPTED_BY_DISTRIBUTOR ||
    s === OrderStatus.SENT_TO_DISTRIBUTOR
  )
    return { step: 2, pct: "w-2/3" };
  return { step: 1, pct: "w-1/3" };
}

function isActive(order: Order) {
  return !TERMINAL_STATUSES.includes(order.status);
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

/* -- filter types -- */
type FilterValue = "all" | "active" | "delivered" | "cancelled";

const PAGE_SIZE = 6;

/* -- API response shape -- */
interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  summary: { all: number; active: number; delivered: number; cancelled: number };
}

function OrderSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="space-y-3 p-4">
        <div className="h-5 w-40 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-56 rounded-lg bg-[#e1e3e4]" />
        <div className="h-8 w-full rounded-lg bg-[#e1e3e4]" />
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [page, setPage] = useState(1);

  const fetchOrders = useCallback(
    async (currentFilter: FilterValue, currentPage: number) => {
      setLoading(true);
      const params = new URLSearchParams({
        statusGroup: currentFilter,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      try {
        const res = await fetch(`/api/orders?${params.toString()}`);
        const json: OrdersResponse = await res.json();
        setData(json);
      } catch {
        // mantém dado anterior
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchOrders(filter, page);
  }, [filter, page, fetchOrders]);

  function handleFilterChange(val: FilterValue) {
    setFilter(val);
    setPage(1);
  }

  /* -- derived -- */
  const orders = data?.orders ?? [];
  const activeOrders = orders.filter(isActive);
  const pastOrders = orders.filter((o) => !isActive(o));
  const summary = data?.summary ?? { all: 0, active: 0, delivered: 0, cancelled: 0 };
  const totalPages = data?.totalPages ?? 1;

  /* -- filter options -- */
  const filterOptions: FilterOption<FilterValue>[] = [
    { label: "Todos", value: "all", count: summary.all },
    { label: "Ativos", value: "active", count: summary.active },
    { label: "Entregues", value: "delivered", count: summary.delivered },
    { label: "Cancelados", value: "cancelled", count: summary.cancelled },
  ];

  const showActiveOrders = filter === "all" || filter === "active";

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-5 pt-5 mb-4">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary mb-0.5">
          Acompanhamento
        </p>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-[#191c1d]">
          Meus Pedidos
        </h1>
      </div>

      {/* Filtros */}
      <div className="px-5 mb-5">
        <FilterChips options={filterOptions} value={filter} onChange={handleFilterChange} />
      </div>

      {loading ? (
        <div className="space-y-3 px-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-5">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#5697E9]/15">
            <ClipboardList className="h-8 w-8 text-[#5697E9]/50" />
          </div>
          <p className="text-[#737688]">
            {filter === "all"
              ? "Nenhum pedido encontrado."
              : "Nenhum pedido nessa categoria."}
          </p>
        </div>
      ) : (
        <>
          {/* -- Active Orders -- */}
          {showActiveOrders && activeOrders.length > 0 && (
            <div className="px-5 mb-6">
              {filter === "all" && (
                <h2 className="font-heading text-sm font-extrabold uppercase tracking-widest text-[#737688] mb-3">
                  Em andamento
                </h2>
              )}
              <div className="space-y-5">
                {activeOrders.map((order) => {
                  const { step, pct } = getProgress(order.status);
                  return (
                    <Link key={order.id} href={`/orders/${order.id}`} className="block">
                      <div className="bg-[#f3f4f5] rounded-2xl p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-[#5697E9]/8 rounded-full -mr-16 -mt-16 blur-3xl" />
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                              <Droplets className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-heading text-base font-bold text-[#191c1d] leading-tight">
                                Pedido #{shortId(order.id)}
                              </h3>
                              <p className="text-xs text-[#737688] font-medium truncate">
                                {formatDate(order.delivery_date)} •{" "}
                                <span className="text-primary">
                                  {formatCurrency(order.total_cents)}
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="relative pb-1">
                            <div className="absolute top-3 left-0 w-full h-0.5 bg-[#e1e3e4] rounded-full">
                              <div className={`h-full bg-[#00E0FF] rounded-full transition-all ${pct}`} />
                            </div>
                            <div className="relative flex justify-between">
                              {[
                                { step: 1, icon: Check, label: "Confirmado" },
                                { step: 2, icon: Truck, label: "A caminho" },
                                { step: 3, icon: Home, label: "Entregue" },
                              ].map(({ step: s, icon: Icon, label }) => (
                                <div key={s} className="flex flex-col items-center gap-1.5">
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                      step >= s
                                        ? "bg-[#00E0FF] text-[#001735]"
                                        : "bg-[#e1e3e4] text-[#737688]"
                                    }`}
                                  >
                                    <Icon className="h-3 w-3" />
                                  </div>
                                  <span
                                    className={`text-[9px] font-bold uppercase tracking-wide ${
                                      step >= s ? "text-[#001735]" : "text-[#b0b3c6]"
                                    }`}
                                  >
                                    {label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* -- Past Deliveries -- */}
          {pastOrders.length > 0 && (
            <section className="px-5">
              {filter === "all" && (
                <h2 className="font-heading text-sm font-extrabold uppercase tracking-widest text-[#737688] mb-3">
                  Histórico
                </h2>
              )}
              <div className="space-y-3">
                {pastOrders.map((order) => {
                  const d = new Date(order.delivery_date);
                  const month = d
                    .toLocaleDateString("pt-BR", { month: "short" })
                    .replace(".", "")
                    .toUpperCase();
                  const day = d.getDate().toString().padStart(2, "0");
                  return (
                    <Link key={order.id} href={`/orders/${order.id}`} className="block">
                      <div className="bg-white p-4 rounded-xl flex items-center justify-between group transition-all duration-200 hover:bg-[#f3f4f5] shadow-sm overflow-hidden">
                        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
                          <div className="text-center w-10 shrink-0">
                            <p className="text-[9px] font-bold uppercase text-[#737688]">{month}</p>
                            <p className="text-lg font-heading font-black text-[#191c1d] leading-tight">
                              {day}
                            </p>
                          </div>
                          <div className="h-8 w-px bg-[#e1e3e4] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[#191c1d] truncate">
                              Pedido #{shortId(order.id)}
                            </p>
                            <p className="text-xs text-[#737688] font-medium truncate">
                              {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}{" "}
                              •{" "}
                              {STATUS_LABELS[order.status] ??
                                order.status.replace(/_/g, " ").toLowerCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="font-heading font-bold text-sm text-[#191c1d]">
                            {formatCurrency(order.total_cents)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-[#737688] group-hover:text-primary transition-colors shrink-0" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="mt-5">
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                  <p className="mt-2 text-center text-xs text-[#b0b3c6]">
                    Página {page} de {totalPages} • {data?.total ?? 0} pedidos
                  </p>
                </div>
              )}
            </section>
          )}

          {/* -- Upsell Banner -- */}
          {filter === "all" && (
            <div className="mx-5 mt-6 rounded-2xl overflow-hidden relative h-36 bg-[#191c1d] shadow-xl">
              <div className="absolute inset-0 bg-linear-to-r from-[#191c1d] to-transparent" />
              <div className="absolute inset-0 flex items-center px-6">
                <div className="max-w-xs relative z-10">
                  <h4 className="text-white font-heading text-base font-extrabold mb-1">
                    Assine e Economize 15%
                  </h4>
                  <p className="text-[#b6c4ff] text-xs mb-3">
                    Monte um plano recorrente para sua entrega semanal.
                  </p>
                  <Link
                    href="/subscription"
                    className="inline-block bg-white text-[#191c1d] px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform"
                  >
                    Ver Planos
                  </Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

