"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, History } from "lucide-react";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { EmptyState } from "@/src/components/shared/empty-state";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { api } from "@/src/lib/api-client";
import { APP_TIME_ZONE, toIsoDay, todayIso, addDaysIso, isoDayToDate } from "@/src/lib/datetime";
import { plural } from "@/src/lib/format";
import { formatCurrency } from "@/src/lib/utils";
import { isCashPaymentMethod } from "@xua/shared/mappers/payment";

interface DriverHistoryItem {
  order_id: string;
  consumer_name: string;
  address_line: string;
  status: string;
  total_items_qty: number;
  total_cents: number;
  occurred_at: string;
  failure_reason: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
}

function dayTitle(iso: string) {
  const today = todayIso();
  if (iso === today) return "Hoje";
  if (iso === addDaysIso(today, -1)) return "Ontem";
  return isoDayToDate(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function timeOf(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

export default function DriverHistoryPage() {
  const query = useQuery({
    queryKey: ["driver-history"],
    queryFn: async () => (await api.get<{ deliveries?: DriverHistoryItem[] }>("/api/driver/deliveries/history")).deliveries ?? [],
  });
  const items = query.data ?? [];

  // Agrupa por dia (fuso da operação) para o motorista conferir o que recebeu.
  const groups = new Map<string, DriverHistoryItem[]>();
  for (const item of items) {
    const day = toIsoDay(new Date(item.occurred_at));
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Histórico" description="Entregas concluídas e ocorrências." />
      <div className="space-y-6 px-4 pb-6">
        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="Nada por aqui ainda" description="As entregas concluídas aparecem neste histórico." />
        ) : (
          [...groups.entries()].map(([day, list]) => {
            const delivered = list.filter((i) => i.status === "DELIVERED");
            const cash = delivered
              .filter((i) => isCashPaymentMethod(i.payment_method))
              .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);
            return (
              <section key={day} aria-label={dayTitle(day)} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground first-letter:uppercase">{dayTitle(day)}</h2>
                  <p className="text-xs text-muted-foreground">
                    {plural(delivered.length, "entrega", "entregas")}
                    {cash > 0 ? ` · ${formatCurrency(cash)} em dinheiro` : ""}
                  </p>
                </div>
                <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                  {list.map((item) => (
                    <li key={item.order_id}>
                      <Link href={`/driver/deliveries/${item.order_id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
                        <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{timeOf(item.occurred_at)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <span className="truncate">{item.consumer_name}</span>
                            <StatusBadge status={item.status} className="h-5 shrink-0 px-2 text-[11px]" />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {plural(item.total_items_qty, "item", "itens")} · {item.address_line}
                          </p>
                          {item.failure_reason ? (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-destructive">
                              <AlertTriangle className="size-3 shrink-0" aria-hidden /> {item.failure_reason}
                            </p>
                          ) : null}
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
