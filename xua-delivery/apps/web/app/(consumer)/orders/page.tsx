"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight, ClipboardList, Droplets } from "lucide-react";
import type { Order } from "@/src/types";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { PageHeader } from "@/src/components/shared/page-header";
import { EmptyState } from "@/src/components/shared/empty-state";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { OrderStepper } from "@/src/components/shared/order-stepper";
import { Pagination } from "@/src/components/shared/pagination";
import { useOrders, type OrdersFilterValue } from "@/src/hooks/consumer/use-orders";
import { useHasActivePlans } from "@/src/hooks/consumer/use-subscription-plans";
import { ACTIVE_ORDER_STATUSES } from "@/src/lib/order-status";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import { formatCurrency, formatDate } from "@/src/lib/utils";

function isActive(order: Order) {
  return ACTIVE_ORDER_STATUSES.includes(order.status);
}

function windowLabel(window: string) {
  return window === "MORNING" ? "Manhã" : "Tarde";
}

export default function OrdersPage() {
  const [filter, setFilter] = useState<OrdersFilterValue>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useOrders(filter, page);
  const { hasPlans } = useHasActivePlans();

  const orders = data?.orders ?? [];
  const activeOrders = orders.filter(isActive);
  const pastOrders = orders.filter((o) => !isActive(o));
  const summary = data?.summary ?? { all: 0, active: 0, delivered: 0, cancelled: 0 };
  const totalPages = data?.totalPages ?? 1;

  const tabs: { value: OrdersFilterValue; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: summary.all },
    { value: "active", label: "Ativos", count: summary.active },
    { value: "delivered", label: "Entregues", count: summary.delivered },
    { value: "cancelled", label: "Cancelados", count: summary.cancelled },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Meus pedidos" sticky>
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as OrdersFilterValue);
            setPage(1);
          }}
        >
          <TabsList className="h-11 w-full">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="h-9 gap-1 px-1 text-xs sm:text-sm">
                {t.label}
                {data ? <span className="text-muted-foreground tabular-nums">{t.count}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <div className="space-y-6 px-4 pt-2 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Não foi possível carregar seus pedidos"
            action={
              <Button variant="outline" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            }
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={filter === "all" ? "Você ainda não fez pedidos" : "Nenhum pedido nesta aba"}
            action={
              filter === "all" ? (
                <Button asChild variant="cta" size="xl">
                  <Link href="/catalog">Fazer meu primeiro pedido</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {activeOrders.length > 0 ? (
              <section aria-labelledby="sec-ativos" className="space-y-3">
                {filter === "all" ? (
                  <h2 id="sec-ativos" className="text-sm font-semibold text-foreground">
                    Em andamento
                  </h2>
                ) : null}
                <ul className="space-y-3">
                  {activeOrders.map((order) => (
                    <li key={order.id}>
                      <Link href={`/orders/${order.id}`} className="block rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                        <Card className="flex flex-col gap-4 rounded-2xl border-hairline p-4 transition-colors hover:border-primary/40">
                          <div className="flex items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10">
                              <Droplets className="size-5 text-primary" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-heading text-base font-bold text-ink">#{formatShortOrderId(order.id)}</h3>
                                <StatusBadge status={order.status} />
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatDate(order.delivery_date)} · {windowLabel(order.delivery_window)} ·{" "}
                                <span className="font-semibold text-foreground">{formatCurrency(order.total_cents)}</span>
                              </p>
                            </div>
                          </div>
                          <OrderStepper status={order.status} />
                        </Card>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {pastOrders.length > 0 ? (
              <section aria-labelledby="sec-historico" className="space-y-3">
                {filter === "all" ? (
                  <h2 id="sec-historico" className="text-sm font-semibold text-foreground">
                    Histórico
                  </h2>
                ) : null}
                <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                  {pastOrders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href={`/orders/${order.id}`}
                        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">#{formatShortOrderId(order.id)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDate(order.delivery_date)} · {formatCurrency(order.total_cents)}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {totalPages > 1 ? (
              <div className="space-y-2">
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                <p className="text-center text-xs text-muted-foreground">
                  Página {page} de {totalPages} · {data?.total ?? 0} pedidos
                </p>
              </div>
            ) : null}

            {/* Só promove assinatura quando há plano (antes levava a uma rota 404, C-06). */}
            {filter === "all" && hasPlans ? (
              <Card className="flex flex-col flex-row items-center gap-4 rounded-2xl border-0 bg-linear-to-br from-primary to-sky p-5 text-primary-foreground">
                <CalendarDays className="size-8 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-bold">Receba sem precisar pedir</p>
                  <p className="text-sm text-primary-foreground/80">Monte uma entrega recorrente.</p>
                </div>
                <Button asChild variant="cta" size="lg" className="shrink-0">
                  <Link href="/subscription/create">Ver planos</Link>
                </Button>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
