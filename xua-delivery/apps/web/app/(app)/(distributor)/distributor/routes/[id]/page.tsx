"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Navigation, Route } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ReceiptPrintButton } from "@/src/components/shared/receipt-print-button";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { api } from "@/src/lib/api-client";
import { plural } from "@/src/lib/format";
import type { StatusTone } from "@/src/lib/order-status";
import { routeReceiptsUrl } from "@/src/lib/receipt";
import { formatDate } from "@/src/lib/utils";
import type { DeliveryWindow } from "@xua/shared/enums";

type RouteStop = {
  order_id: string;
  consumer_name: string;
  consumer_phone: string | null;
  total_items_qty: number;
  status: string;
  status_label: string;
  status_tone: "success" | "danger" | "warning" | "neutral";
  address_line: string;
  maps_url: string;
};

type RouteGroup = {
  zone_name: string;
  delivery_window: DeliveryWindow;
  stops: RouteStop[];
};

type RouteDetail = {
  id: string;
  date: string;
  total_stops: number;
  delivered_stops: number;
  pending_stops: number;
  groups: RouteGroup[];
};

function windowLabel(window: RouteGroup["delivery_window"]) {
  return window === "MORNING" ? "Manhã" : "Tarde";
}

const TONE: Record<RouteStop["status_tone"], StatusTone> = {
  success: "success",
  danger: "danger",
  warning: "warning",
  neutral: "neutral",
};

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["distributor-route", id],
    queryFn: async () => (await api.get<{ route: RouteDetail | null }>(`/api/distributor/routes/${id}`)).route,
  });
  const route = query.data ?? null;
  const routeDateLabel = route?.date ? formatDate(route.date) : id === "today" ? "Hoje" : id;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader back="/distributor/queue" title="Rota do dia" description={routeDateLabel} />
      <div className="space-y-4 px-4 pb-4">
        {query.isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : query.isError ? (
          <EmptyState icon={Route} title={query.error instanceof Error ? query.error.message : "Erro ao carregar a rota"} />
        ) : (
          <>
            <dl className="grid grid-cols-3 divide-x divide-hairline rounded-2xl border border-hairline bg-card text-center">
              <div className="px-2 py-2.5">
                <dt className="text-[11px] text-muted-foreground">Paradas</dt>
                <dd className="font-heading text-xl font-bold text-ink">{route?.total_stops ?? 0}</dd>
              </div>
              <div className="px-2 py-2.5">
                <dt className="text-[11px] text-muted-foreground">Pendentes</dt>
                <dd className="font-heading text-xl font-bold text-warning-foreground">{route?.pending_stops ?? 0}</dd>
              </div>
              <div className="px-2 py-2.5">
                <dt className="text-[11px] text-muted-foreground">Entregues</dt>
                <dd className="font-heading text-xl font-bold text-success-foreground">{route?.delivered_stops ?? 0}</dd>
              </div>
            </dl>

            {!route || route.groups.length === 0 ? (
              <EmptyState icon={Route} title="Nenhuma parada nesta data" description="Pedidos despachados para entrega aparecem aqui, por zona e período." />
            ) : (
              route.groups.map((group) => (
                <section key={`${group.zone_name}-${group.delivery_window}`} className="space-y-2">
                  <h2 className="flex items-baseline justify-between text-sm font-semibold text-foreground">
                    <span>
                      {group.zone_name} · {windowLabel(group.delivery_window)}
                    </span>
                    <span className="font-normal text-muted-foreground">{group.stops.length} paradas</span>
                  </h2>
                  <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                    {group.stops.map((stop) => (
                      <li key={stop.order_id} className="flex items-center gap-3 px-4 py-3">
                        <Link href={`/distributor/orders/${stop.order_id}`} className="min-w-0 flex-1">
                          <p className="flex items-center gap-2">
                            <span className="truncate font-semibold text-foreground">{stop.consumer_name}</span>
                            <StatusBadge label={stop.status_label} tone={TONE[stop.status_tone]} className="h-5 shrink-0 px-2 text-[11px]" />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {plural(stop.total_items_qty, "item", "itens")} · {stop.address_line}
                          </p>
                        </Link>
                        <Button asChild variant="soft" size="icon-touch" aria-label={`Abrir ${stop.address_line} no mapa`}>
                          <a href={stop.maps_url} target="_blank" rel="noreferrer">
                            <Navigation />
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {route && route.total_stops > 0 ? (
        <StickyActionBar summary={<span className="block text-center text-xs">Comprovantes já emitidos, na ordem da rota. Sem valor fiscal.</span>}>
          <ReceiptPrintButton label="Imprimir comprovantes da rota" buildUrl={(format) => routeReceiptsUrl(id, format)} />
        </StickyActionBar>
      ) : null}
    </div>
  );
}
