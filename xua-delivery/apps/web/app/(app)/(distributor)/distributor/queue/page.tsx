"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Bell, BellOff, ClipboardList, RefreshCw, Route, SlidersHorizontal } from "lucide-react";

import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { Pagination } from "@/src/components/shared/pagination";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { PushOptInBanner } from "@/src/components/shared/push-notifications-card";
import { RejectOrderDialog } from "@/src/components/distributor/reject-order-dialog";
import { OrderCard } from "@/src/components/distributor/queue/order-card";
import { OrderSidePanel } from "@/src/components/distributor/queue/order-side-panel";
import { QueueBoard } from "@/src/components/distributor/queue/queue-board";
import { QueueFilterFields } from "@/src/components/distributor/queue/queue-filters";
import {
  SUMMARY_FALLBACK,
  buildBoardQuery,
  buildQueueQuery,
  countActiveFilters,
  isQueueOrigin,
  isQueueSort,
  isQueueTab,
  parsePage,
  type QueueBoardResponse,
  type QueueOrder,
  type QueueOrigin,
  type QueueResponse,
  type QueueSort,
  type QueueTabValue,
  type QueueView,
  type QuickAction,
} from "@/src/components/distributor/queue/queue-model";
import { QueueSummaryCards } from "@/src/components/distributor/queue/queue-summary";
import { QueueTable } from "@/src/components/distributor/queue/queue-table";
import { QueueSearch, QueueTabs, QueueToolbar, type QueueTab } from "@/src/components/distributor/queue/queue-toolbar";
import { useDistributorDrivers } from "@/src/hooks/distributor/use-distributor-drivers";
import { useIsDesktop, useMediaQuery } from "@/src/hooks/use-media-query";
import { useFallbackRefetchInterval } from "@/src/realtime/realtime-provider";
import { playNewOrderSound, setNewOrderSoundEnabled, useNewOrderSoundEnabled } from "@/src/realtime/alert-sound";
import { ApiError, api } from "@/src/lib/api-client";
import { formatShortOrderId } from "@/src/lib/order-detail-format";
import { cn, formatTime } from "@/src/lib/utils";
import { Badge } from "@/src/components/ui/badge";

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Não foi possível carregar a fila.";
}

function DistributorQueueContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  // Quadro em 3 colunas só cabe a partir de 1024px; entre 768 e 1023 a lista vira tabela.
  const isWide = useMediaQuery("(min-width: 1024px)");
  // Reserva caso o socket caia (T3.5): 2 min ao vivo, 20 s sem tempo real.
  const fallbackInterval = useFallbackRefetchInterval();
  const soundEnabled = useNewOrderSoundEnabled();

  const stageParam = searchParams.get("stage");
  const activeTab: QueueTabValue = isQueueTab(stageParam) ? stageParam : "all";
  const originParam = searchParams.get("origin");
  const sortParam = searchParams.get("sort");
  const page = parsePage(searchParams.get("page"));
  const qParam = searchParams.get("q")?.trim() ?? "";
  const origin: QueueOrigin = isQueueOrigin(originParam) ? originParam : "all";
  const deliveryDate = searchParams.get("deliveryDate") ?? "";
  const driverId = searchParams.get("driverId") ?? "all";
  const sort: QueueSort = isQueueSort(sortParam) ? sortParam : "created_desc";
  const view: QueueView = searchParams.get("view") === "list" ? "list" : "board";

  const [search, setSearch] = useState(qParam);
  const [panelOrderId, setPanelOrderId] = useState<string | null>(null);
  const [rejectOrder, setRejectOrder] = useState<QueueOrder | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const skipNextSearchSync = useRef(false);

  const updateQuery = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        const shouldDelete =
          !value ||
          (key === "stage" && value === "all") ||
          (key === "page" && value === "1") ||
          (key === "origin" && value === "all") ||
          (key === "driverId" && value === "all") ||
          (key === "sort" && value === "created_desc") ||
          (key === "view" && value === "board");
        if (shouldDelete) params.delete(key);
        else params.set(key, value);
      }
      if (resetPage && !("page" in updates)) params.delete("page");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Sincroniza `search` com o `q` da URL (back/forward). skipNextSearchSync
  // evita o loop com o efeito abaixo, que escreve na URL a cada digitação.
  useEffect(() => {
    if (skipNextSearchSync.current) {
      skipNextSearchSync.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização com a URL (sistema externo)
    setSearch(qParam);
  }, [qParam]);

  useEffect(() => {
    const trimmed = deferredSearch.trim();
    const nextQ = trimmed.length >= 2 ? trimmed : "";
    if (nextQ === qParam) return;
    skipNextSearchSync.current = true;
    updateQuery({ q: nextQ || null }, true);
  }, [deferredSearch, qParam, updateQuery]);

  // "Todos" no quadro (desktop largo ou celular): o backend devolve as três etapas já separadas, cada uma
  // com os primeiros pedidos e o total real. Qualquer outra visão é a lista de UMA etapa, filtrada e
  // paginada no banco. Só a consulta da visão atual roda (a outra fica desligada).
  const boardMode = activeTab === "all" && (!isDesktop || (view === "board" && isWide));
  const filterQuery = { q: qParam, origin, deliveryDate, driverId, sort };

  const listQuery = useQuery<QueueResponse>({
    queryKey: ["distributor-queue", "list", activeTab, page, qParam, origin, deliveryDate, driverId, sort],
    queryFn: () => api.get(`/api/orders?${buildQueueQuery({ stage: activeTab, page, ...filterQuery })}`),
    enabled: !boardMode,
    placeholderData: (previousData) => previousData,
    refetchInterval: fallbackInterval,
  });

  const boardQuery = useQuery<QueueBoardResponse>({
    queryKey: ["distributor-queue", "board", qParam, origin, deliveryDate, driverId, sort],
    queryFn: () => api.get(`/api/orders?${buildBoardQuery(filterQuery)}`),
    enabled: boardMode,
    placeholderData: (previousData) => previousData,
    refetchInterval: fallbackInterval,
  });

  const queueQuery = boardMode ? boardQuery : listQuery;

  const driversQuery = useDistributorDrivers();

  const actionMutation = useMutation({
    mutationFn: ({ orderId, action, payload }: { orderId: string; action: QuickAction; payload?: Record<string, unknown> }) =>
      api.patch(`/api/orders/${orderId}/${action}`, payload ?? {}),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["distributor-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail", variables.orderId] });
      if (variables.action === "accept") {
        toast.success("Pedido aceito", {
          action: { label: "Separar", onClick: () => router.push(`/distributor/orders/${variables.orderId}/checklist`) },
        });
      } else {
        toast.success("Pedido recusado. O cliente foi avisado.");
        setRejectOrder(null);
      }
    },
  });

  useEffect(() => {
    if (!listQuery.data) return;
    if (listQuery.data.totalPages > 0 && page > listQuery.data.totalPages) {
      updateQuery({ page: String(listQuery.data.totalPages) }, false);
    }
  }, [page, listQuery.data, updateQuery]);

  const orders = useMemo(() => listQuery.data?.orders ?? [], [listQuery.data]);
  const summary = (boardMode ? boardQuery.data?.summary : listQuery.data?.summary) ?? SUMMARY_FALLBACK;
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 0;
  const boardColumns = boardQuery.data?.columns;
  const isEmpty = boardMode
    ? !boardColumns || Object.values(boardColumns).every((column) => column.orders.length === 0)
    : orders.length === 0;
  const drivers = driversQuery.data ?? [];
  const actionLoadingId = actionMutation.isPending ? (actionMutation.variables?.orderId ?? null) : null;
  const activeFilterCount = countActiveFilters({ origin, deliveryDate, driverId, sort });
  const hasFilters = Boolean(qParam) || activeFilterCount > 0;

  function openOrder(order: QueueOrder) {
    if (isDesktop) setPanelOrderId(order.id);
    else router.push(`/distributor/orders/${order.id}`);
  }

  function clearFilters() {
    setSearch("");
    updateQuery({ q: null, origin: null, deliveryDate: null, driverId: null, sort: null }, true);
  }

  const handlers = {
    onOpen: openOrder,
    onAccept: (o: QueueOrder) => actionMutation.mutate({ orderId: o.id, action: "accept" }),
    onReject: (o: QueueOrder) => setRejectOrder(o),
  };

  const tabs: QueueTab[] = [
    { value: "all", label: "Todos", count: summary.active },
    { value: "incoming", label: "Novos", count: summary.incoming },
    { value: "preparation", label: "Preparo", count: summary.preparation },
    { value: "route", label: "Em rota", count: summary.route },
    { value: "history", label: "Histórico", count: null },
  ];

  const filterValues = { origin, deliveryDate, driverId, sort };
  const fetching = queueQuery.isFetching;

  function renderOrders() {
    if (boardMode && boardColumns) {
      // Celular: etapas empilhadas (Novos primeiro). Desktop largo: quadro em 3 colunas.
      return (
        <QueueBoard
          stages={boardColumns}
          onViewAll={(stage) => updateQuery({ stage }, true)}
          actionLoadingId={actionLoadingId}
          columns={isWide}
          dimmed={fetching}
          {...handlers}
        />
      );
    }
    if (isDesktop) {
      return <QueueTable orders={orders} actionLoadingId={actionLoadingId} dimmed={fetching} {...handlers} />;
    }
    return (
      <div className={cn("grid gap-3", fetching && "opacity-80")}>
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} loading={actionLoadingId === order.id} {...handlers} />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl md:max-w-[1440px]">
      <PageHeader
        title="Pedidos"
        description={fetching ? "Atualizando…" : queueQuery.dataUpdatedAt ? `Atualizado às ${formatTime(new Date(queueQuery.dataUpdatedAt))}` : undefined}
        sticky
        className="md:static md:px-2 md:pt-6"
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-touch"
              className="md:size-9"
              aria-label={soundEnabled ? "Som de novos pedidos: ligado" : "Som de novos pedidos: desligado"}
              aria-pressed={soundEnabled}
              title={soundEnabled ? "Som de novos pedidos: ligado" : "Som de novos pedidos: desligado"}
              onClick={() => {
                const next = !soundEnabled;
                setNewOrderSoundEnabled(next);
                // O clique também libera o áudio: tocar aqui confirma que funciona.
                if (next) playNewOrderSound();
                toast(next ? "Som de novos pedidos ligado" : "Som de novos pedidos desligado");
              }}
            >
              {soundEnabled ? <Bell /> : <BellOff />}
            </Button>
            <Button asChild variant="ghost" size="icon-touch" className="md:size-9" aria-label="Rota do dia" title="Rota do dia">
              <Link href="/distributor/routes/today">
                <Route />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-touch"
              className="md:size-9"
              aria-label="Atualizar"
              title="Atualizar"
              disabled={fetching}
              onClick={() => void queueQuery.refetch()}
            >
              <RefreshCw className={cn(fetching && "animate-spin")} />
            </Button>
          </>
        }
      >
        {/* Celular: abas, busca e filtros ficam colados ao topo. No desktop vivem na barra de ferramentas abaixo. */}
        <div className="space-y-2 md:hidden">
          <QueueTabs tabs={tabs} value={activeTab} onChange={(value) => updateQuery({ stage: value }, true)} variant="pill" />
          <div className="flex gap-2">
            <QueueSearch value={search} onChange={setSearch} className="flex-1" inputClassName="h-11 rounded-xl" />
            <Button variant="outline" size="xl" className="relative px-3" onClick={() => setFiltersOpen(true)} aria-label="Filtros">
              <SlidersHorizontal />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 ? (
                <Badge className="absolute -top-1.5 -right-1.5 size-5 rounded-full px-0 font-bold">{activeFilterCount}</Badge>
              ) : null}
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="space-y-4 px-4 pb-6 md:space-y-5 md:px-2">
        <QueueSummaryCards
          summary={summary}
          activeTab={activeTab}
          onSelectStage={(stage) => updateQuery({ stage }, true)}
          onSelectOverdue={() => updateQuery({ stage: null, sort: "delivery_asc", view: "list" }, true)}
        />
        <QueueToolbar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(value) => updateQuery({ stage: value }, true)}
          view={view}
          onViewChange={(next) => updateQuery({ view: next }, false)}
          search={search}
          onSearchChange={setSearch}
          hasActiveFilters={hasFilters}
          onClear={clearFilters}
          filters={
            <QueueFilterFields
              layout="inline"
              {...filterValues}
              drivers={drivers}
              activeTab={activeTab}
              onChange={(updates) => updateQuery(updates, true)}
            />
          }
        />

        <PushOptInBanner
          storageKey="xua:push-banner:distributor-queue"
          title="Não perca pedidos com o app fechado"
          description="Ative as notificações para ser avisado de pedidos novos mesmo com a tela desligada."
        />
        {summary.overdue > 0 && activeTab !== "history" ? (
          <Alert variant="destructive" className="border-destructive/30 bg-danger-surface md:hidden">
            <AlertTriangle aria-hidden />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{summary.overdue === 1 ? "1 pedido está atrasado." : `${summary.overdue} pedidos estão atrasados.`}</span>
              <Button variant="link" className="h-auto p-0 text-destructive" onClick={() => updateQuery({ sort: "delivery_asc" }, true)}>
                Ordenar por entrega
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {queueQuery.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(queueQuery.error)}</AlertDescription>
          </Alert>
        ) : null}
        {actionMutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(actionMutation.error)}</AlertDescription>
          </Alert>
        ) : null}
        {activeTab === "history" && !deliveryDate ? (
          <p className="text-xs text-muted-foreground">Mostrando os últimos 30 dias. Use os filtros para outra data.</p>
        ) : null}

        {queueQuery.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-dashed border-hairline bg-card">
            <EmptyState
              icon={ClipboardList}
              title={hasFilters ? "Nenhum pedido com esses filtros" : activeTab === "history" ? "Nada no histórico" : "Nenhum pedido agora"}
              description={hasFilters ? undefined : "Pedidos novos aparecem aqui na hora, com aviso."}
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          renderOrders()
        )}

        {!boardMode && totalPages > 1 ? (
          <Pagination page={page} totalPages={totalPages} onPageChange={(next) => updateQuery({ page: String(next) }, false)} />
        ) : null}
        {!boardMode && total > 0 ? <p className="text-center text-xs text-muted-foreground">{total} pedidos</p> : null}
      </div>

      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filtros"
        footer={
          <>
            <Button
              variant="outline"
              size="xl"
              onClick={() => {
                clearFilters();
                setFiltersOpen(false);
              }}
            >
              Limpar
            </Button>
            <Button variant="cta" size="xl" onClick={() => setFiltersOpen(false)}>
              Ver pedidos
            </Button>
          </>
        }
      >
        <QueueFilterFields
          layout="stack"
          {...filterValues}
          drivers={drivers}
          activeTab={activeTab}
          onChange={(updates) => updateQuery(updates, true)}
        />
      </ResponsiveDialog>

      <OrderSidePanel orderId={panelOrderId} onClose={() => setPanelOrderId(null)} />

      <RejectOrderDialog
        open={Boolean(rejectOrder)}
        onOpenChange={(open) => !open && setRejectOrder(null)}
        orderLabel={rejectOrder ? `#${formatShortOrderId(rejectOrder.id)}` : ""}
        loading={actionMutation.isPending}
        onConfirm={(payload) => rejectOrder && actionMutation.mutate({ orderId: rejectOrder.id, action: "reject", payload })}
      />
    </div>
  );
}

export default function DistributorQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3 p-4">
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      }
    >
      <DistributorQueueContent />
    </Suspense>
  );
}
