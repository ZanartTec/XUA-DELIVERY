"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { StatusPill } from "@/src/components/shared/status-pill";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { formatCurrency, formatDate, formatTime } from "@/src/lib/utils";
import { ChevronRight, ClipboardList, Clock3, MapPin, Package2, Truck } from "lucide-react";
import { useSocket } from "@/src/hooks/use-socket";
import type { Order } from "@/src/types";
import { OrderStatus } from "@/src/types/enums";
import { cn } from "@/src/lib/utils";

interface QueueOrder extends Order {
  consumer_name: string;
  address_summary: string;
  total_items_qty: number;
  item_summary: string;
  driver_name?: string | null;
  sla_deadline: string;
}

function formatWindowLabel(window: QueueOrder["delivery_window"]) {
  return window === "MORNING" ? "Manhã" : "Tarde";
}

const SECTION_CONFIG = [
  {
    key: "incoming",
    label: "Aguardando aceite",
    description: "Pedidos novos que ainda precisam de decisão da distribuidora.",
    statuses: [OrderStatus.SENT_TO_DISTRIBUTOR] as const,
  },
  {
    key: "preparation",
    label: "Em preparação",
    description: "Pedidos aceitos, separados ou já prontos para despacho.",
    statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH] as const,
  },
  {
    key: "route",
    label: "Em rota",
    description: "Pedidos já despachados para o motorista concluir a entrega.",
    statuses: [OrderStatus.OUT_FOR_DELIVERY] as const,
  },
] as const;

const TAB_CONFIG = [
  {
    value: "all",
    label: "Visão geral",
    description: "Todos os pedidos ativos",
    statuses: SECTION_CONFIG.flatMap((section) => section.statuses),
  },
  {
    value: "incoming",
    label: "Aceite",
    description: "Fila de resposta",
    statuses: [OrderStatus.SENT_TO_DISTRIBUTOR] as const,
  },
  {
    value: "preparation",
    label: "Preparação",
    description: "Separação e despacho",
    statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH] as const,
  },
  {
    value: "route",
    label: "Em rota",
    description: "Acompanhamento do motorista",
    statuses: [OrderStatus.OUT_FOR_DELIVERY] as const,
  },
] as const;

type QueueTabValue = (typeof TAB_CONFIG)[number]["value"];

function matchesStatuses(status: string, statuses: readonly string[]) {
  return statuses.includes(status);
}

function formatShortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function getStageMeta(status: QueueOrder["status"]) {
  switch (status) {
    case OrderStatus.SENT_TO_DISTRIBUTOR:
      return {
        label: "Aguardando aceite",
        icon: Clock3,
        iconClassName: "bg-[#fff2dd] text-[#9a5a00]",
        badgeClassName: "bg-[#fff2dd] text-[#7a4700]",
      };
    case OrderStatus.OUT_FOR_DELIVERY:
      return {
        label: "Em rota",
        icon: Truck,
        iconClassName: "bg-[#eaf7ff] text-[#005d91]",
        badgeClassName: "bg-[#eaf7ff] text-[#005d91]",
      };
    case OrderStatus.READY_FOR_DISPATCH:
      return {
        label: "Pronto para despacho",
        icon: Package2,
        iconClassName: "bg-[#e7f7ef] text-[#166534]",
        badgeClassName: "bg-[#e7f7ef] text-[#166534]",
      };
    default:
      return {
        label: "Em preparação",
        icon: Package2,
        iconClassName: "bg-[#edf4ff] text-[#0b2a59]",
        badgeClassName: "bg-[#edf4ff] text-[#0b2a59]",
      };
  }
}

function QueueSkeleton() {
  return (
    <div className="animate-pulse rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
      <div className="space-y-3">
        <div className="h-3 w-28 rounded-full bg-[#e1e3e4]" />
        <div className="h-7 w-40 rounded-full bg-[#e1e3e4]" />
        <div className="h-4 w-full rounded-full bg-[#eef0f3]" />
        <div className="h-4 w-5/6 rounded-full bg-[#eef0f3]" />
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: QueueOrder }) {
  const stage = getStageMeta(order.status);
  const StageIcon = stage.icon;

  return (
    <Link href={`/distributor/orders/${order.id}`} className="group block">
      <article className="rounded-[28px] bg-white px-4 py-4 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(0,26,64,0.12)]">
        <div className="flex items-start gap-3">
          <div className={cn("mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl", stage.iconClassName)}>
            <StageIcon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7d8494]">
                  {stage.label}
                </p>
                <h2 className="mt-1 truncate font-heading text-base sm:text-lg font-extrabold text-[#0d1b2f]">
                  Pedido #{formatShortOrderId(order.id)}
                </h2>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-heading text-base sm:text-xl font-extrabold text-primary">
                  {formatCurrency(order.total_cents)}
                </p>
                <p className="text-xs text-[#7d8494]">{formatTime(order.created_at)}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#1f2937]">{order.consumer_name}</p>
              <p className="text-sm text-[#5d6473]">{order.item_summary}</p>
            </div>

            <div className="grid gap-2 text-sm text-[#5d6473]">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#7d8494]" />
                <span className="min-w-0">{order.address_summary}</span>
              </div>

              <div className="flex items-center gap-2">
                <Package2 className="h-4 w-4 shrink-0 text-[#7d8494]" />
                <span>
                  {order.total_items_qty} item{order.total_items_qty === 1 ? "" : "ns"} • Janela {formatWindowLabel(order.delivery_window)}
                </span>
              </div>

              {order.driver_name ? (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-[#7d8494]" />
                  <span>Motorista: {order.driver_name}</span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={order.status} className={stage.badgeClassName} />

              {order.status === OrderStatus.SENT_TO_DISTRIBUTOR ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-[#fff2dd] px-3 py-1 text-xs font-semibold text-[#7a4700]">
                  <Clock3 className="h-3.5 w-3.5" />
                  Responder em
                  <SlaCountdown deadlineIso={order.sla_deadline} className="text-xs font-semibold text-inherit" />
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#f3f4f5] px-3 py-1 text-xs font-semibold text-[#5d6473]">
                  {formatDate(order.delivery_date)} • {formatWindowLabel(order.delivery_window)}
                </span>
              )}
            </div>
          </div>

          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eff4ff] text-primary transition-transform duration-200 group-hover:translate-x-0.5">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>
      </article>
    </Link>
  );
}

function Section({
  label,
  description,
  orders,
}: {
  label: string;
  description: string;
  orders: QueueOrder[];
}) {
  if (orders.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7d8494]">Operação</p>
          <h2 className="mt-1 font-heading text-xl font-extrabold text-[#0d1b2f]">{label}</h2>
          <p className="mt-1 text-sm text-[#5d6473]">{description}</p>
        </div>

        <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-sm font-semibold text-primary">
          {orders.length}
        </span>
      </div>

      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </section>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf4ff] text-primary">
        <ClipboardList className="h-8 w-8" />
      </div>
      <h2 className="mt-4 font-heading text-xl font-extrabold text-[#0d1b2f]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[#5d6473]">{description}</p>
    </div>
  );
}

export default function DistributorQueuePage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QueueTabValue>("all");
  const { on, off } = useSocket();

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?scope=distributor");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      setOrders(data.orders ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a fila.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const handleFocus = () => {
      void fetchOrders();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchOrders]);

  useEffect(() => {
    const handler = () => {
      void fetchOrders();
    };

    on("new_order", handler);
    return () => off("new_order", handler);
  }, [on, off, fetchOrders]);

  const totals = {
    active: orders.length,
    incoming: orders.filter((order) => order.status === OrderStatus.SENT_TO_DISTRIBUTOR).length,
    preparation: orders.filter((order) => matchesStatuses(order.status, [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH])).length,
    route: orders.filter((order) => order.status === OrderStatus.OUT_FOR_DELIVERY).length,
  };

  const selectedTab = TAB_CONFIG.find((tab) => tab.value === activeTab) ?? TAB_CONFIG[0];
  const filteredOrders = orders.filter((order) => matchesStatuses(order.status, selectedTab.statuses));

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_28%),linear-gradient(135deg,#0038b0_0%,#004de1_52%,#2a84ff_100%)] px-4 py-5 sm:px-5 sm:py-6 text-white shadow-[0_22px_50px_rgba(27,74,154,0.28)]">
        <div className="absolute -right-10 top-8 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

        <div className="relative space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">Operação da distribuidora</p>
              <h1 className="mt-2 font-heading text-2xl sm:text-[2rem] leading-none font-extrabold">Fila de pedidos</h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/82">
                Acompanhe aceite, preparação e entregas com a hierarquia operacional da Xuá.
              </p>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[24px] bg-white/14 backdrop-blur">
              <ClipboardList className="h-7 w-7 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[24px] bg-white/12 px-3 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Aceite</p>
              <p className="mt-1 font-heading text-2xl font-extrabold">{totals.incoming}</p>
            </div>
            <div className="rounded-[24px] bg-white/12 px-3 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Preparo</p>
              <p className="mt-1 font-heading text-2xl font-extrabold">{totals.preparation}</p>
            </div>
            <div className="rounded-[24px] bg-white/12 px-3 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Em rota</p>
              <p className="mt-1 font-heading text-2xl font-extrabold">{totals.route}</p>
            </div>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as QueueTabValue)}>
        <TabsList className="!h-auto !bg-white flex w-full flex-row overflow-x-auto rounded-[28px] p-1 shadow-[0_10px_28px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1] scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAB_CONFIG.map((tab) => {
            const count = orders.filter((order) => matchesStatuses(order.status, tab.statuses)).length;

            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="!h-auto flex flex-1 shrink-0 flex-col items-center gap-0.5 rounded-[22px] px-2 py-2 text-center data-active:border-transparent data-active:bg-[#edf4ff] data-active:text-[#0b2a59] sm:items-start sm:gap-1 sm:px-3 sm:py-3 sm:text-left"
              >
                <span className="text-xs font-semibold sm:text-sm">{tab.label}</span>
                <span className="hidden text-[11px] leading-tight text-current/70 sm:block">{tab.description}</span>
                <span className="rounded-full bg-[#f3f4f5] px-2 py-0.5 text-[11px] font-semibold text-[#5d6473] data-[state=active]:bg-white">
                  {count} pedido{count === 1 ? "" : "s"}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {error ? (
        <div className="rounded-[24px] border border-[#ffd8d5] bg-[#fff3f1] px-4 py-3 text-sm text-[#8a1c14]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <QueueSkeleton key={index} />
          ))}
        </div>
      ) : totals.active === 0 ? (
        <EmptyState
          title="Nenhum pedido ativo agora"
          description="Quando um novo pedido confirmado chegar para a distribuidora, ele aparecerá aqui com SLA e etapa operacional."
        />
      ) : activeTab === "all" ? (
        <div className="space-y-6">
          {SECTION_CONFIG.map((section) => (
            <Section
              key={section.key}
              label={section.label}
              description={section.description}
              orders={orders.filter((order) => matchesStatuses(order.status, section.statuses))}
            />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title={`Sem pedidos em ${selectedTab.label.toLowerCase()}`}
          description="A fila dessa etapa está vazia no momento. Troque de aba para revisar as demais frentes da operação."
        />
      ) : (
        <Section label={selectedTab.label} description={selectedTab.description} orders={filteredOrders} />
      )}

      <section className="rounded-[32px] bg-[#0d1b2f] px-5 py-5 text-white shadow-[0_18px_44px_rgba(0,26,64,0.22)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">Resumo operacional</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1.3fr_1fr] sm:items-center">
          <div>
            <h2 className="font-heading text-2xl font-extrabold leading-tight">
              {totals.incoming > 0
                ? `${totals.incoming} pedido${totals.incoming === 1 ? "" : "s"} aguardando aceite`
                : "Fila sob controle no momento"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/72">
              Priorize os pedidos em SLA de aceite e acompanhe a evolução até o despacho do motorista.
            </p>
          </div>

          <div className="space-y-3 rounded-[24px] bg-white/8 px-4 py-4 backdrop-blur">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Pedidos ativos</span>
              <span className="font-semibold">{totals.active}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Em preparação</span>
              <span className="font-semibold">{totals.preparation}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Em rota</span>
              <span className="font-semibold">{totals.route}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
