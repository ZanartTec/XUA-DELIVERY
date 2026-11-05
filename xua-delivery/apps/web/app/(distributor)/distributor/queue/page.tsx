"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  Route,
  Repeat2,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { Pagination } from "@/src/components/shared/pagination";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { DeliveryUrgencyBadge } from "@/src/components/shared/distributor/delivery-urgency-badge";
import {
  OrderCustomerSection,
  OrderInstructionsSection,
  OrderItemsSection,
  OrderPaymentSection,
  OrderStatusHeader,
  OrderSubscriptionSection,
  OrderTimelineSection,
} from "@/src/components/distributor/order-detail-sections";
import { RejectOrderDialog } from "@/src/components/distributor/reject-order-dialog";
import { useDeliveryUrgency } from "@/src/hooks/distributor/use-delivery-urgency";
import { useOrderDetail } from "@/src/hooks/distributor/use-order-detail";
import { useDistributorDrivers } from "@/src/hooks/distributor/use-distributor-drivers";
import { useIsDesktop } from "@/src/hooks/use-media-query";
import { useSocket } from "@/src/hooks/use-socket";
import { ApiError, api } from "@/src/lib/api-client";
import { cn, formatCurrency, formatDateShort, formatRelativeShort, formatTime } from "@/src/lib/utils";
import { formatScheduledTime, formatShortOrderId, isFromSubscription, matchesStatuses } from "@/src/lib/order-detail-format";
import type { Order } from "@/src/types";
import { OrderStatus } from "@/src/types/enums";

const PAGE_SIZE = 30;

type QueueTabValue = "all" | "incoming" | "preparation" | "route" | "history";
type QueueOrigin = "all" | "cart" | "subscription";
type QueueSort = "created_desc" | "delivery_asc" | "sla_asc";
type QuickAction = "accept" | "reject";

interface QueueOrder extends Order {
  consumer_name: string;
  address_summary: string;
  total_items_qty: number;
  item_summary: string;
  driver_name?: string | null;
  sla_deadline: string;
  order_origin?: "cart" | "subscription";
}

interface QueueSummary {
  active: number;
  incoming: number;
  preparation: number;
  route: number;
  overdue: number;
}

interface QueueResponse {
  orders: QueueOrder[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  summary: QueueSummary;
}

const STAGES = [
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

const SUMMARY_FALLBACK: QueueSummary = { active: 0, incoming: 0, preparation: 0, route: 0, overdue: 0 };

const isQueueTab = (v: string | null): v is QueueTabValue =>
  v === "all" || v === "incoming" || v === "preparation" || v === "route" || v === "history";
const isQueueOrigin = (v: string | null): v is QueueOrigin => v === "all" || v === "cart" || v === "subscription";
const isQueueSort = (v: string | null): v is QueueSort => v === "created_desc" || v === "delivery_asc" || v === "sla_asc";

function parsePage(value: string | null) {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function shortAddress(address: string) {
  const [streetAndNumber, neighborhood] = address.split(" - ");
  return neighborhood ? `${streetAndNumber} · ${neighborhood}` : streetAndNumber || address;
}

function buildQueueQuery(input: {
  stage: QueueTabValue;
  page: number;
  q: string;
  origin: QueueOrigin;
  deliveryDate: string;
  driverId: string;
  sort: QueueSort;
}) {
  const params = new URLSearchParams({
    scope: "distributor",
    stage: input.stage,
    page: String(input.page),
    limit: String(PAGE_SIZE),
    sort: input.sort,
  });
  if (input.q) params.set("q", input.q);
  if (input.origin !== "all") params.set("origin", input.origin);
  if (input.deliveryDate) params.set("deliveryDate", input.deliveryDate);
  if (input.driverId !== "all") params.set("driverId", input.driverId);
  return params.toString();
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Não foi possível carregar a fila.";
}

const URGENCY_STRIPE: Record<string, string> = {
  overdue: "bg-destructive",
  urgent: "bg-warning",
  soon: "bg-warning/60",
};
/** Card do pedido: informação no meio, ação da etapa na base em largura total. */
function OrderCard({
  order,
  loading,
  onOpen,
  onAccept,
  onReject,
}: {
  order: QueueOrder;
  loading: boolean;
  onOpen: (order: QueueOrder) => void;
  onAccept: (order: QueueOrder) => void;
  onReject: (order: QueueOrder) => void;
}) {
  const urgency = useDeliveryUrgency(order);
  const isNew = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const toPrepare = matchesStatuses(order.status, STAGES[1].statuses);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-hairline bg-card shadow-sm">
      {URGENCY_STRIPE[urgency.level] ? (
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", URGENCY_STRIPE[urgency.level])} />
      ) : null}
      <button type="button" onClick={() => onOpen(order)} className="block w-full space-y-2 p-4 pl-5 text-left hover:bg-muted/40">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">#{formatShortOrderId(order.id)}</span>
          <span>· {formatRelativeShort(order.created_at)}</span>
          {isFromSubscription(order) ? (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium text-primary">
              <Repeat2 className="size-3" aria-hidden /> Assinatura
            </span>
          ) : null}
          <DeliveryUrgencyBadge urgency={urgency} className="ml-auto" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-semibold text-foreground">{order.consumer_name}</p>
          <p className="shrink-0 font-heading font-bold text-ink tabular-nums">{formatCurrency(order.total_cents)}</p>
        </div>
        <p className="line-clamp-1 text-sm text-foreground">{order.item_summary}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {shortAddress(order.address_summary)}
          </span>
          <span className="flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden /> {formatDateShort(order.delivery_date)} · {formatScheduledTime(order)}
          </span>
          {!isNew ? (
            <span className={cn("flex items-center gap-1", !order.driver_name && toPrepare && "font-medium text-warning-foreground")}>
              <Truck className="size-3.5" aria-hidden /> {order.driver_name ?? "Sem motorista"}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} audience="ops" />
          {isNew ? (
            <span className="flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-xs font-semibold text-warning-foreground">
              <Clock3 className="size-3" aria-hidden />
              <SlaCountdown deadlineIso={order.sla_deadline} prefix="Responder em" expiredLabel="Prazo de resposta vencido" className="font-sans text-xs font-semibold text-inherit" />
            </span>
          ) : null}
        </div>
      </button>

      {isNew ? (
        <div className="grid grid-cols-[auto_1fr] gap-2 border-t border-hairline p-2">
          <Button variant="outline" size="xl" className="px-4" disabled={loading} onClick={() => onReject(order)}>
            <X aria-hidden /> Recusar
          </Button>
          <Button variant="cta" size="xl" disabled={loading} onClick={() => onAccept(order)}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Aceitar
          </Button>
        </div>
      ) : toPrepare ? (
        <div className="border-t border-hairline p-2">
          <Button asChild variant="soft" size="xl" className="w-full">
            <Link href={`/distributor/orders/${order.id}/checklist`}>
              <PackageCheck aria-hidden /> Separar e despachar
            </Link>
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function OrderList({
  orders,
  actionLoadingId,
  onOpen,
  onAccept,
  onReject,
  empty,
}: {
  orders: QueueOrder[];
  actionLoadingId: string | null;
  onOpen: (o: QueueOrder) => void;
  onAccept: (o: QueueOrder) => void;
  onReject: (o: QueueOrder) => void;
  empty: string;
}) {
  if (orders.length === 0) {
    return <p className="rounded-2xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} loading={actionLoadingId === order.id} onOpen={onOpen} onAccept={onAccept} onReject={onReject} />
        </li>
      ))}
    </ul>
  );
}

/** Painel lateral do pedido (desktop). No celular o pedido abre na tela completa. */
function OrderSidePanel({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { order, isLoading } = useOrderDetail(orderId);
  return (
    <Sheet open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] gap-0 overflow-y-auto bg-background p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-hairline bg-card p-4">
          <SheetTitle className="font-heading text-xl">{order ? order.consumer_name : "Pedido"}</SheetTitle>
          <SheetDescription>{order ? `Pedido #${formatShortOrderId(order.id)}` : "Carregando…"}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-4">
          {isLoading || !order ? (
            <>
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </>
          ) : (
            <>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href={`/distributor/orders/${order.id}`}>Abrir pedido completo</Link>
              </Button>
              <OrderStatusHeader order={order} />
              <OrderInstructionsSection order={order} />
              <OrderCustomerSection order={order} />
              <OrderItemsSection order={order} />
              <OrderPaymentSection order={order} />
              <OrderSubscriptionSection order={order} />
              <OrderTimelineSection order={order} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DistributorQueueContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const { on, off } = useSocket();

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
          (key === "sort" && value === "created_desc");
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

  const queueQueryString = useMemo(
    () => buildQueueQuery({ stage: activeTab, page, q: qParam, origin, deliveryDate, driverId, sort }),
    [activeTab, deliveryDate, driverId, origin, page, qParam, sort],
  );

  const queueQuery = useQuery<QueueResponse>({
    queryKey: ["distributor-queue", activeTab, page, qParam, origin, deliveryDate, driverId, sort],
    queryFn: () => api.get(`/api/orders?${queueQueryString}`),
    placeholderData: (previousData) => previousData,
  });

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
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["distributor-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail"] });
    };
    on("new_order", handler);
    on("order_status_changed", handler);
    return () => {
      off("new_order", handler);
      off("order_status_changed", handler);
    };
  }, [on, off, queryClient]);

  useEffect(() => {
    if (!queueQuery.data) return;
    if (queueQuery.data.totalPages > 0 && page > queueQuery.data.totalPages) {
      updateQuery({ page: String(queueQuery.data.totalPages) }, false);
    }
  }, [page, queueQuery.data, updateQuery]);

  const orders = useMemo(() => queueQuery.data?.orders ?? [], [queueQuery.data]);
  const summary = queueQuery.data?.summary ?? SUMMARY_FALLBACK;
  const total = queueQuery.data?.total ?? 0;
  const totalPages = queueQuery.data?.totalPages ?? 0;
  const drivers = driversQuery.data ?? [];
  const actionLoadingId = actionMutation.isPending ? (actionMutation.variables?.orderId ?? null) : null;
  const activeFilterCount = [origin !== "all", Boolean(deliveryDate), driverId !== "all", sort !== "created_desc"].filter(Boolean).length;

  const grouped = useMemo(
    () => STAGES.map((stage) => ({ ...stage, orders: orders.filter((o) => matchesStatuses(o.status, stage.statuses)) })),
    [orders],
  );

  function openOrder(order: QueueOrder) {
    if (isDesktop) setPanelOrderId(order.id);
    else router.push(`/distributor/orders/${order.id}`);
  }

  function clearFilters() {
    setSearch("");
    updateQuery({ q: null, origin: null, deliveryDate: null, driverId: null, sort: null }, true);
  }

  const listProps = {
    actionLoadingId,
    onOpen: openOrder,
    onAccept: (o: QueueOrder) => actionMutation.mutate({ orderId: o.id, action: "accept" }),
    onReject: (o: QueueOrder) => setRejectOrder(o),
  };

  const tabs: Array<{ value: QueueTabValue; label: string; count: number | null }> = [
    { value: "all", label: "Todos", count: summary.active },
    { value: "incoming", label: "Novos", count: summary.incoming },
    { value: "preparation", label: "Preparo", count: summary.preparation },
    { value: "route", label: "Em rota", count: summary.route },
    { value: "history", label: "Histórico", count: null },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Pedidos"
        description={queueQuery.isFetching ? "Atualizando…" : queueQuery.dataUpdatedAt ? `Atualizado às ${formatTime(new Date(queueQuery.dataUpdatedAt))}` : undefined}
        sticky
        actions={
          <>
            <Button asChild variant="ghost" size="icon-touch" aria-label="Rota do dia">
              <Link href="/distributor/routes/today">
                <Route />
              </Link>
            </Button>
            <Button variant="ghost" size="icon-touch" aria-label="Atualizar" disabled={queueQuery.isFetching} onClick={() => void queueQuery.refetch()}>
              <RefreshCw className={cn(queueQuery.isFetching && "animate-spin")} />
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Tabs value={activeTab} onValueChange={(value) => updateQuery({ stage: value }, true)}>
            <TabsList className="h-11 w-full justify-start overflow-x-auto [scrollbar-width:none]">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="h-9 shrink-0 gap-1.5 px-3">
                  {tab.label}
                  {tab.count != null ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] tabular-nums",
                        tab.value === "incoming" && tab.count > 0 ? "bg-warning text-white" : "text-muted-foreground",
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pedido, cliente, bairro…"
                aria-label="Buscar pedidos"
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <Button variant="outline" size="xl" className="relative px-3" onClick={() => setFiltersOpen(true)} aria-label="Filtros">
              <SlidersHorizontal />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="space-y-4 px-4 pb-6">
        {summary.overdue > 0 && activeTab !== "history" ? (
          <Alert variant="destructive" className="border-destructive/30 bg-danger-surface">
            <AlertTriangle aria-hidden />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {summary.overdue === 1 ? "1 pedido está atrasado." : `${summary.overdue} pedidos estão atrasados.`}
              </span>
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
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={qParam || activeFilterCount ? "Nenhum pedido com esses filtros" : activeTab === "history" ? "Nada no histórico" : "Nenhum pedido agora"}
            description={qParam || activeFilterCount ? undefined : "Pedidos novos aparecem aqui na hora, com aviso."}
            action={
              qParam || activeFilterCount ? (
                <Button variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : null
            }
          />
        ) : activeTab === "all" ? (
          // Celular: etapas empilhadas (Novos primeiro). Desktop: quadro em 3 colunas.
          <div className={cn("grid gap-6 lg:grid-cols-3 lg:gap-4", queueQuery.isFetching && "opacity-80")}>
            {grouped.map((stage) => (
              <section key={stage.key} aria-labelledby={`st-${stage.key}`} className="space-y-2 lg:rounded-2xl lg:bg-surface-low lg:p-3">
                <h2 id={`st-${stage.key}`} className="flex items-baseline justify-between text-sm font-semibold text-foreground">
                  <span>
                    {stage.label} <span className="font-normal text-muted-foreground">· {stage.hint}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">{stage.orders.length}</span>
                </h2>
                <OrderList orders={stage.orders} empty="Nada nesta etapa" {...listProps} />
              </section>
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-3 lg:grid-cols-2 xl:grid-cols-3", queueQuery.isFetching && "opacity-80")}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} loading={actionLoadingId === order.id} onOpen={openOrder} onAccept={listProps.onAccept} onReject={listProps.onReject} />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <Pagination page={page} totalPages={totalPages} onPageChange={(next) => updateQuery({ page: String(next) }, false)} />
        ) : null}
        {total > 0 ? <p className="text-center text-xs text-muted-foreground">{total} pedidos</p> : null}
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
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="f-date">Data de entrega</Label>
            <Input id="f-date" type="date" value={deliveryDate} onChange={(e) => updateQuery({ deliveryDate: e.target.value || null }, true)} className="h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label>Motorista</Label>
            <Select value={driverId} onValueChange={(value) => updateQuery({ driverId: value }, true)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motoristas</SelectItem>
                <SelectItem value="unassigned">Sem motorista</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Origem</Label>
            <ToggleGroup type="single" variant="outline" value={origin} onValueChange={(v) => v && updateQuery({ origin: v }, true)} className="grid w-full grid-cols-3">
              <ToggleGroupItem value="all" className="h-11">Todos</ToggleGroupItem>
              <ToggleGroupItem value="cart" className="h-11">Avulso</ToggleGroupItem>
              <ToggleGroupItem value="subscription" className="h-11">Assinatura</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5">
            <Label>Ordenar por</Label>
            <Select value={sort} onValueChange={(value) => updateQuery({ sort: value }, true)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Mais recentes</SelectItem>
                <SelectItem value="delivery_asc">Entrega mais próxima</SelectItem>
                {activeTab !== "history" ? <SelectItem value="sla_asc">Prazo de resposta</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
        </div>
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
    <Suspense fallback={<div className="space-y-3 p-4"><Skeleton className="h-40 rounded-2xl" /></div>}>
      <DistributorQueueContent />
    </Suspense>
  );
}
