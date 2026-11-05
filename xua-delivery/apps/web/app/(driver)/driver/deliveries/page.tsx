"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, MapPin, MessageSquareText, Navigation, PackageOpen, Phone, Recycle, Truck } from "lucide-react";
import { useSocket } from "@/src/hooks/use-socket";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { EmptyState } from "@/src/components/shared/empty-state";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { api } from "@/src/lib/api-client";
import { describeDoorCharge, mapsHref, windowLabel } from "@/src/lib/driver";
import { phoneHref, plural } from "@/src/lib/format";
import { cn, formatCurrency } from "@/src/lib/utils";
import type { DeliveryWindow } from "@xua/shared/enums";

interface Delivery {
  order_id: string;
  consumer_name: string;
  consumer_phone: string | null;
  address_line: string;
  status: string;
  delivery_window: DeliveryWindow;
  sequence: number;
  total_items_qty: number;
  total_cents: number;
  payment_method?: string | null;
  payment_status?: string | null;
  cash_change_for_cents?: number | null;
  delivery_instructions?: string | null;
  bottles_full_ordered?: number;
  max_bottle_charge_cents?: number;
}

const isPending = (s: string) => s === "OUT_FOR_DELIVERY";
const isDone = (s: string) => s === "DELIVERED" || s === "DELIVERY_FAILED";

export default function DeliveriesPage() {
  const { on, off } = useSocket();
  const query = useQuery({
    queryKey: ["driver-deliveries"],
    queryFn: async () => (await api.get<{ deliveries?: Delivery[] }>("/api/driver/deliveries")).deliveries ?? [],
    refetchInterval: 60_000,
  });
  const refetch = query.refetch;
  const refresh = useCallback(() => void refetch(), [refetch]);

  // Entrega despachada ou cancelada com o app aberto aparece sem precisar sair e voltar.
  useEffect(() => {
    on("new_delivery", refresh);
    on("order_status_changed", refresh);
    return () => {
      off("new_delivery", refresh);
      off("order_status_changed", refresh);
    };
  }, [on, off, refresh]);

  const deliveries = query.data ?? [];
  const pending = deliveries.filter((d) => isPending(d.status));
  const done = deliveries.filter((d) => isDone(d.status));
  const cashToCollect = pending.reduce((sum, d) => {
    const charge = describeDoorCharge(d);
    return charge.due && charge.method === "cash" ? sum + d.total_cents : sum;
  }, 0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Entregas de hoje">
        {/* Resumo compacto no topo: lido de relance, sem empurrar a 1ª parada para baixo */}
        <dl className="grid grid-cols-3 divide-x divide-hairline rounded-2xl border border-hairline bg-card text-center">
          <div className="px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">A entregar</dt>
            <dd className="font-heading text-xl font-bold text-ink">{query.isLoading ? "—" : pending.length}</dd>
          </div>
          <div className="px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">Concluídas</dt>
            <dd className="font-heading text-xl font-bold text-ink">{query.isLoading ? "—" : done.length}</dd>
          </div>
          <div className="px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">Receber em dinheiro</dt>
            <dd className="font-heading text-base font-bold text-ink tabular-nums">{query.isLoading ? "—" : formatCurrency(cashToCollect)}</dd>
          </div>
        </dl>
      </PageHeader>

      <div className="space-y-6 px-4 pb-6">
        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Não foi possível carregar as entregas"
            action={
              <Button variant="outline" size="xl" onClick={refresh}>
                Tentar de novo
              </Button>
            }
          />
        ) : deliveries.length === 0 ? (
          <EmptyState icon={PackageOpen} title="Nenhuma entrega por enquanto" description="Quando a distribuidora despachar um pedido para você, ele aparece aqui." />
        ) : null}

        {pending.length > 0 ? (
          <section aria-labelledby="sec-rota" className="space-y-3">
            <h2 id="sec-rota" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Truck className="size-4 text-primary" aria-hidden /> Próximas paradas
            </h2>
            <ol className="space-y-3">
              {pending.map((d) => (
                <li key={d.order_id}>
                  <StopCard delivery={d} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {done.length > 0 ? (
          <section aria-labelledby="sec-feitas" className="space-y-3">
            <h2 id="sec-feitas" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="size-4 text-success-foreground" aria-hidden /> Concluídas hoje
            </h2>
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
              {done.map((d) => (
                <li key={d.order_id}>
                  <Link href={`/driver/deliveries/${d.order_id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{d.consumer_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{d.address_line}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Parada da rota: informação no meio, 3 ações grandes na base do card (Mapa · Ligar · Entregar). */
function StopCard({ delivery: d }: { delivery: Delivery }) {
  const charge = describeDoorCharge(d);
  const tel = phoneHref(d.consumer_phone);
  const bottles = (d.max_bottle_charge_cents ?? 0) > 0 ? d.bottles_full_ordered ?? 0 : 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-sm">
      <Link href={`/driver/deliveries/${d.order_id}`} className="block space-y-3 p-4 hover:bg-muted/40">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary font-heading text-lg font-bold text-primary-foreground" aria-label={`Parada ${d.sequence}`}>
            {d.sequence}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold text-foreground">{d.consumer_name}</p>
              <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary">{windowLabel(d.delivery_window)}</span>
            </div>
            <p className="mt-0.5 flex items-start gap-1 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{d.address_line}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-surface-low px-2.5 py-1 font-medium text-foreground">{plural(d.total_items_qty, "item", "itens")}</span>
          <span
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold",
              charge.due ? "bg-warning-surface text-warning-foreground" : "bg-success-surface text-success-foreground",
            )}
          >
            {charge.method === "card" ? <CreditCard className="size-3.5" aria-hidden /> : <Banknote className="size-3.5" aria-hidden />}
            {charge.label}
            {charge.detail ? ` · ${charge.detail}` : ""}
          </span>
          {bottles > 0 ? (
            <span className="flex items-center gap-1 rounded-md bg-sky/10 px-2.5 py-1 font-medium text-primary">
              <Recycle className="size-3.5" aria-hidden /> Recolher {plural(bottles, "vazio", "vazios")}
            </span>
          ) : null}
        </div>

        {d.delivery_instructions ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-surface-low px-3 py-2 text-xs text-foreground">
            <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="line-clamp-2">{d.delivery_instructions}</span>
          </p>
        ) : null}
      </Link>

      <div className="grid grid-cols-3 gap-2 border-t border-hairline p-2">
        <Button asChild variant="soft" size="xl" className="px-2">
          <a href={mapsHref(d.address_line)} target="_blank" rel="noreferrer" aria-label={`Abrir ${d.address_line} no mapa`}>
            <Navigation /> Mapa
          </a>
        </Button>
        {tel ? (
          <Button asChild variant="soft" size="xl" className="px-2">
            <a href={tel} aria-label={`Ligar para ${d.consumer_name}`}>
              <Phone /> Ligar
            </a>
          </Button>
        ) : (
          <Button variant="soft" size="xl" className="px-2" disabled>
            <Phone /> Ligar
          </Button>
        )}
        <Button asChild variant="cta" size="xl" className="px-2">
          <Link href={`/driver/deliveries/${d.order_id}/otp`}>Entregar</Link>
        </Button>
      </div>
    </article>
  );
}
