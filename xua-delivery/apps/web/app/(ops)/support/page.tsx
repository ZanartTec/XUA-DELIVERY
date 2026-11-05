"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Headphones, Search, X } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { ApiError, api } from "@/src/lib/api-client";
import { formatPhone } from "@/src/lib/format";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import type { Order } from "@/src/types";

interface SearchResult extends Order {
  consumer_name: string;
  consumer_email: string;
  consumer_phone: string;
}

/** Fila de atenção: situações em que o cliente costuma precisar de ajuda. */
const ATTENTION = [
  { status: "DELIVERY_FAILED", label: "Falhas", empty: "Nenhuma entrega com falha." },
  { status: "SENT_TO_DISTRIBUTOR", label: "Sem aceite", empty: "Nenhum pedido esperando a distribuidora." },
  { status: "PAYMENT_PENDING", label: "Pagamento", empty: "Nenhum pagamento pendente." },
  { status: "OUT_FOR_DELIVERY", label: "Em rota", empty: "Nenhuma entrega em andamento." },
] as const;

function useSearch(params: string | null) {
  return useQuery({
    queryKey: ["support-search", params],
    queryFn: async () => (await api.get<{ orders?: SearchResult[] }>(`/api/orders?scope=support&${params}`)).orders ?? [],
    enabled: params !== null,
  });
}

function ResultList({ orders }: { orders: SearchResult[] }) {
  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
      {orders.map((order) => (
        <li key={order.id}>
          <Link href={`/support/${order.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-semibold text-foreground">{order.consumer_name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{formatShortOrderId(order.id)}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(order.delivery_date)} · {formatCurrency(order.total_cents)}
                {order.consumer_phone ? ` · ${formatPhone(order.consumer_phone)}` : ""}
              </p>
            </div>
            <StatusBadge status={order.status} audience="ops" />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function SupportPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<(typeof ATTENTION)[number]["status"]>("DELIVERY_FAILED");

  const search = useSearch(query ? `q=${encodeURIComponent(query)}` : null);
  const attention = useSearch(query ? null : `status=${tab}`);
  const current = ATTENTION.find((a) => a.status === tab)!;
  const error = (query ? search.error : attention.error) as unknown;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(input.trim());
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Suporte" description="Encontre o pedido do cliente e resolva." sticky>
        <form onSubmit={submit} className="flex gap-2" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!e.target.value) setQuery("");
              }}
              placeholder="Nome, e-mail, telefone ou nº do pedido"
              aria-label="Buscar pedido"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <Button type="submit" variant="cta" size="xl" disabled={input.trim().length < 3}>
            Buscar
          </Button>
        </form>
      </PageHeader>

      <div className="space-y-3 px-4 pb-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error instanceof ApiError ? error.message : "Erro na busca. Tente de novo."}</AlertDescription>
          </Alert>
        ) : null}

        {query ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Resultados para “{query}”</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setInput("");
                  setQuery("");
                }}
              >
                <X /> Limpar
              </Button>
            </div>
            {search.isLoading ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : (search.data ?? []).length === 0 ? (
              <EmptyState icon={Search} title="Nenhum pedido encontrado" description="Tente o telefone com DDD, o e-mail ou o número do pedido (ex.: D78FB484)." />
            ) : (
              <ResultList orders={search.data ?? []} />
            )}
          </>
        ) : (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="h-11 w-full">
                {ATTENTION.map((a) => (
                  <TabsTrigger key={a.status} value={a.status} className="h-9 px-2 text-xs sm:text-sm">
                    {a.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {attention.isLoading ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : (attention.data ?? []).length === 0 ? (
              <EmptyState icon={Headphones} title={current.empty} />
            ) : (
              <ResultList orders={attention.data ?? []} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
