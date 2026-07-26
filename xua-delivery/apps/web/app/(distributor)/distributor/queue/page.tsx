"use client";

import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  Loader2,
  MapPin,
  RefreshCw,
  Repeat2,
  Route,
  Search,
  ShoppingCart,
  Truck,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { FilterChips } from "@/src/components/shared/filter-chips";
import { Pagination } from "@/src/components/shared/pagination";
import {
  OrderCustomerSection,
  OrderDeliveryStepsSection,
  OrderInstructionsSection,
  OrderItemsSection,
  OrderPaymentSection,
  OrderStatusHeader,
  OrderSubscriptionSection,
  OrderTimelineSection,
} from "@/src/components/distributor/order-detail-sections";
import { useOrderDetail } from "@/src/hooks/distributor/use-order-detail";
import { useSocket } from "@/src/hooks/use-socket";
import { ApiError, api } from "@/src/lib/api-client";
import { cn, formatCurrency, formatDate, formatTime } from "@/src/lib/utils";
import {
  formatScheduledTime,
  formatShortOrderId,
  isFromSubscription,
  matchesStatuses,
} from "@/src/lib/order-detail-format";
import type { Order } from "@/src/types";
import { OrderStatus } from "@/src/types/enums";

const PAGE_SIZE = 30;
const VIRTUAL_ROW_HEIGHT = 104;
const VIRTUAL_OVERSCAN = 4;

type QueueTabValue = "all" | "incoming" | "preparation" | "route";
type QueueOrigin = "all" | "cart" | "subscription";
type QueueSort = "created_desc" | "delivery_asc" | "sla_asc";
type QuickAction = "accept" | "reject" | "assign_driver" | "dispatch";

const QUICK_ACTION_ROUTE: Record<QuickAction, string> = {
  accept: "accept",
  reject: "reject",
  assign_driver: "assign-driver",
  dispatch: "dispatch",
};

interface QueueOrder extends Order {
  consumer_name: string;
  address_summary: string;
  total_items_qty: number;
  item_summary: string;
  driver_name?: string | null;
  sla_deadline: string;
  order_origin?: "cart" | "subscription";
  user_subscription_id?: string | null;
  subscription_delivery_date_id?: string | null;
  subscription_plan_name?: string | null;
  subscription_status?: string | null;
  subscription_delivery_status?: string | null;
  delivery_sequence?: number | null;
  total_deliveries?: number | null;
  completed_deliveries?: number | null;
  remaining_deliveries?: number | null;
  remaining_after_current?: number | null;
  quantity_for_this_delivery?: number | null;
  subscription_total_quantity?: number | null;
  subscription_remaining_quantity?: number | null;
}

interface QueueSummary {
  active: number;
  incoming: number;
  preparation: number;
  route: number;
}

interface QueueResponse {
  orders: QueueOrder[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  summary: QueueSummary;
}

interface DriverResponse {
  drivers: Array<{ id: string; name: string }>;
}

const REJECT_REASON_OPTIONS = [
  { value: "out_of_stock", label: "Falta de estoque" },
  { value: "delivery_area_issue", label: "Endereco fora da operacao" },
  { value: "operational_capacity", label: "Capacidade esgotada" },
  { value: "other", label: "Outro" },
] as const;

const KANBAN_COLUMNS = [
  {
    key: "incoming",
    label: "Aceite",
    description: "Responder novos pedidos",
    statuses: [OrderStatus.SENT_TO_DISTRIBUTOR] as const,
    tone: "border-amber-200 bg-amber-50/70 text-amber-900",
    dot: "bg-amber-500",
  },
  {
    key: "preparation",
    label: "Preparo",
    description: "Separacao, checklist e motorista",
    statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH] as const,
    tone: "border-sky-200 bg-sky-50/70 text-sky-950",
    dot: "bg-sky-500",
  },
  {
    key: "route",
    label: "Em rota",
    description: "Entregas em andamento",
    statuses: [OrderStatus.OUT_FOR_DELIVERY] as const,
    tone: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
    dot: "bg-emerald-500",
  },
] as const;

const TAB_CONFIG: Array<{ value: QueueTabValue; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "incoming", label: "Aceite" },
  { value: "preparation", label: "Preparo" },
  { value: "route", label: "Em rota" },
];

const ORIGIN_OPTIONS: Array<{ label: string; value: QueueOrigin }> = [
  { label: "Todos", value: "all" },
  { label: "Carrinho", value: "cart" },
  { label: "Assinatura", value: "subscription" },
];

const SUMMARY_FALLBACK: QueueSummary = {
  active: 0,
  incoming: 0,
  preparation: 0,
  route: 0,
};

function isQueueTab(value: string | null): value is QueueTabValue {
  return value === "all" || value === "incoming" || value === "preparation" || value === "route";
}

function isQueueOrigin(value: string | null): value is QueueOrigin {
  return value === "all" || value === "cart" || value === "subscription";
}

function isQueueSort(value: string | null): value is QueueSort {
  return value === "created_desc" || value === "delivery_asc" || value === "sla_asc";
}

function parsePage(value: string | null) {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function shortAddress(address: string) {
  const [streetAndNumber, neighborhood] = address.split(" - ");
  return neighborhood || streetAndNumber || address;
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

function getTabCount(tab: QueueTabValue, summary: QueueSummary) {
  switch (tab) {
    case "incoming":
      return summary.incoming;
    case "preparation":
      return summary.preparation;
    case "route":
      return summary.route;
    default:
      return summary.active;
  }
}

function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Nao foi possivel carregar a fila.";
}

function getOrderStageLabel(order: QueueOrder) {
  switch (order.status) {
    case OrderStatus.SENT_TO_DISTRIBUTOR:
      return "Aceite";
    case OrderStatus.READY_FOR_DISPATCH:
      return "Pronto";
    case OrderStatus.OUT_FOR_DELIVERY:
      return "Em rota";
    default:
      return "Preparo";
  }
}

function canAssignDriver(status: string) {
  return status === OrderStatus.ACCEPTED_BY_DISTRIBUTOR || status === OrderStatus.READY_FOR_DISPATCH;
}

function useVirtualSlice<T>(items: T[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateHeight = () => setViewportHeight(element.clientHeight || 520);
    updateHeight();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const virtualItems = items.slice(startIndex, endIndex).map((item, offset) => ({
    item,
    index: startIndex + offset,
  }));

  return {
    containerRef,
    virtualItems,
    paddingTop: startIndex * VIRTUAL_ROW_HEIGHT,
    paddingBottom: Math.max(0, (items.length - endIndex) * VIRTUAL_ROW_HEIGHT),
    onScroll: (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop),
  };
}

function QueueSkeleton() {
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, column) => (
        <div key={column} className="rounded-lg border border-[#dfe5ef] bg-white p-2">
          <div className="h-9 animate-pulse rounded-md bg-[#eef0f3]" />
          <div className="mt-2 space-y-2">
            {Array.from({ length: 5 }).map((__, row) => (
              <div key={row} className="h-[96px] animate-pulse rounded-md bg-[#f4f6f8]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function QueueHeaderCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cn("rounded-md border px-3 py-2", tone)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p>
      <p className="mt-0.5 font-heading text-2xl font-extrabold leading-none">{value}</p>
    </div>
  );
}

function OrderMiniCard({
  order,
  selected,
  loading,
  onSelect,
  onAction,
}: {
  order: QueueOrder;
  selected: boolean;
  loading: boolean;
  onSelect: (order: QueueOrder) => void;
  onAction: (order: QueueOrder, action: "accept" | "reject" | "assign") => void;
}) {
  const fromSubscription = isFromSubscription(order);
  const OriginIcon = fromSubscription ? Repeat2 : ShoppingCart;
  const canAccept = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const canAssign = canAssignDriver(order.status);

  return (
    <article
      className={cn(
        "h-[96px] rounded-md border bg-white px-2.5 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-colors hover:border-[#b8c7dd] hover:bg-[#fbfcfe]",
        selected ? "border-[#5697E9] ring-2 ring-[#5697E9]/20" : "border-[#dfe5ef]"
      )}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_76px] gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => onSelect(order)}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#0d1b2f]">#{formatShortOrderId(order.id)}</span>
            <span className="truncate text-sm font-semibold text-[#0d1b2f]">{order.consumer_name}</span>
            <span className="ml-auto hidden items-center gap-1 rounded bg-[#f3f6fb] px-1.5 py-0.5 text-[10px] font-semibold text-[#5d6473] 2xl:inline-flex">
              <OriginIcon className="h-3 w-3" />
              {fromSubscription ? "Ass." : "Cart."}
            </span>
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <p className="truncate text-xs font-medium text-[#334155]">{order.item_summary}</p>
            <p className="text-xs font-bold text-[#0d1b2f]">{formatCurrency(order.total_cents)}</p>
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[11px] text-[#64748b]">
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              {shortAddress(order.address_summary)}
            </span>
            <span className="font-medium text-[#475569]">{formatScheduledTime(order)}</span>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <span className="rounded bg-[#eef2f7] px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]">
              {getOrderStageLabel(order)}
            </span>
            {order.driver_name ? (
              <span className="truncate text-[11px] text-[#64748b]">{order.driver_name}</span>
            ) : (
              <span className="text-[11px] font-medium text-amber-700">Sem motorista</span>
            )}
            {order.status === OrderStatus.SENT_TO_DISTRIBUTOR ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                <Clock3 className="h-3 w-3" />
                <SlaCountdown deadlineIso={order.sla_deadline} className="text-[10px] font-bold text-inherit" />
              </span>
            ) : null}
          </div>
        </button>

        <div className="flex flex-col justify-between gap-1">
          {canAccept ? (
            <Button size="xs" className="h-6 rounded-md bg-emerald-600 text-white hover:bg-emerald-700" disabled={loading} onClick={() => onAction(order, "accept")}>
              <Check className="h-3 w-3" />
              Aceitar
            </Button>
          ) : canAssign ? (
            <Button size="xs" variant="outline" className="h-6 rounded-md" disabled={loading} onClick={() => onAction(order, "assign")}>
              <Truck className="h-3 w-3" />
              Mot.
            </Button>
          ) : (
            <Button size="xs" variant="outline" className="h-6 rounded-md" onClick={() => onSelect(order)}>
              <Eye className="h-3 w-3" />
              Ver
            </Button>
          )}

          {canAccept ? (
            <Button size="xs" variant="destructive" className="h-6 rounded-md" disabled={loading} onClick={() => onAction(order, "reject")}>
              <X className="h-3 w-3" />
              Recusar
            </Button>
          ) : canAssign ? (
            <Button size="xs" variant="ghost" className="h-6 rounded-md" onClick={() => onSelect(order)}>
              <Eye className="h-3 w-3" />
              Ver
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function KanbanColumn({
  label,
  description,
  count,
  tone,
  dot,
  orders,
  selectedOrderId,
  actionLoadingId,
  onSelect,
  onAction,
}: {
  label: string;
  description: string;
  count: number;
  tone: string;
  dot: string;
  orders: QueueOrder[];
  selectedOrderId?: string;
  actionLoadingId: string | null;
  onSelect: (order: QueueOrder) => void;
  onAction: (order: QueueOrder, action: "accept" | "reject" | "assign") => void;
}) {
  const virtual = useVirtualSlice(orders);

  return (
    <section className="min-h-0 rounded-lg border border-[#d8e0eb] bg-[#f7f9fc]">
      <div className={cn("flex h-11 items-center justify-between rounded-t-lg border-b px-3", tone)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", dot)} />
            <h2 className="truncate text-sm font-bold">{label}</h2>
          </div>
          <p className="truncate text-[11px] opacity-70">{description}</p>
        </div>
        <span className="rounded bg-white/80 px-2 py-0.5 text-xs font-bold">{count}</span>
      </div>

      <div ref={virtual.containerRef} onScroll={virtual.onScroll} className="h-[64vh] min-h-[360px] max-h-[680px] overflow-y-auto p-2">
        {orders.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[#ccd6e3] bg-white text-xs text-[#64748b]">
            Sem pedidos nesta etapa
          </div>
        ) : (
          <div style={{ paddingTop: virtual.paddingTop, paddingBottom: virtual.paddingBottom }} className="space-y-2">
            {virtual.virtualItems.map(({ item: order }) => (
              <OrderMiniCard
                key={order.id}
                order={order}
                selected={selectedOrderId === order.id}
                loading={actionLoadingId === order.id}
                onSelect={onSelect}
                onAction={onAction}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OrderDetailSheet({
  order,
  open,
  drivers,
  actionLoading,
  actionError,
  selectedDriver,
  onOpenChange,
  onDriverChange,
  onAccept,
  onAssign,
  onDispatch,
  onRejectClick,
}: {
  order: QueueOrder | null;
  open: boolean;
  drivers: Array<{ id: string; name: string }>;
  actionLoading: boolean;
  actionError: string | null;
  selectedDriver: string;
  onOpenChange: (open: boolean) => void;
  onDriverChange: (driverId: string) => void;
  onAccept: () => void;
  onAssign: () => void;
  onDispatch: () => void;
  onRejectClick: () => void;
}) {
  const detailQuery = useOrderDetail(order?.id ?? null);
  const detail = detailQuery.order;

  if (!order) return null;

  const canAccept = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const canAssign = canAssignDriver(order.status);
  const canChecklist = order.status === OrderStatus.ACCEPTED_BY_DISTRIBUTOR;
  const canDispatch = order.status === OrderStatus.READY_FOR_DISPATCH;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto bg-[#f8fafc] p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b bg-white p-4">
          <SheetTitle className="font-heading text-xl font-extrabold text-[#0d1b2f]">
            Pedido #{formatShortOrderId(order.id)}
          </SheetTitle>
          <SheetDescription>
            {order.consumer_name} - {formatDate(order.delivery_date)} - {formatScheduledTime(order)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 p-4">
          {actionError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</div>
          ) : null}

          {canAssign ? (
            <section className="rounded-lg border border-[#dfe5ef] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Motorista</p>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Select value={selectedDriver || undefined} onValueChange={onDriverChange}>
                  <SelectTrigger className="h-9 rounded-md border-[#dfe5ef] bg-white">
                    <SelectValue placeholder="Selecionar motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-9 rounded-md" disabled={!selectedDriver || actionLoading} onClick={onAssign}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  Atribuir
                </Button>
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-[#dfe5ef] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Acoes rapidas</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {canAccept ? (
                <Button className="h-9 rounded-md bg-emerald-600 text-white hover:bg-emerald-700" disabled={actionLoading} onClick={onAccept}>
                  <Check className="h-4 w-4" />
                  Aceitar pedido
                </Button>
              ) : null}
              {canAccept ? (
                <Button variant="destructive" className="h-9 rounded-md" disabled={actionLoading} onClick={onRejectClick}>
                  <X className="h-4 w-4" />
                  Recusar
                </Button>
              ) : null}
              {canChecklist ? (
                <Button asChild className="h-9 rounded-md bg-[#0d1b2f] text-white hover:bg-[#17253c]">
                  <Link href={`/distributor/orders/${order.id}/checklist`}>
                    <Route className="h-4 w-4" />
                    Checklist
                  </Link>
                </Button>
              ) : null}
              {canDispatch ? (
                <Button className="h-9 rounded-md bg-[#0d1b2f] text-white hover:bg-[#17253c]" disabled={!selectedDriver || actionLoading} onClick={onDispatch}>
                  <Route className="h-4 w-4" />
                  Despachar
                </Button>
              ) : null}
              <Button asChild variant="outline" className="h-9 rounded-md">
                <Link href={`/distributor/orders/${order.id}`}>Abrir tela completa</Link>
              </Button>
            </div>
          </section>

          {detailQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg bg-[#eef0f3]" />
              ))}
            </div>
          ) : detailQuery.isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Não foi possível carregar os detalhes completos do pedido.
            </div>
          ) : detail ? (
            <>
              <OrderStatusHeader order={detail} />
              <OrderInstructionsSection order={detail} />
              <OrderCustomerSection order={detail} />
              <OrderItemsSection order={detail} />
              <OrderSubscriptionSection order={detail} />
              <OrderPaymentSection order={detail} />
              <OrderDeliveryStepsSection order={detail} />
              <OrderTimelineSection order={detail} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RejectDialog({
  open,
  order,
  reason,
  details,
  loading,
  onOpenChange,
  onReasonChange,
  onDetailsChange,
  onConfirm,
}: {
  open: boolean;
  order: QueueOrder | null;
  reason: (typeof REJECT_REASON_OPTIONS)[number]["value"] | "";
  details: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: (typeof REJECT_REASON_OPTIONS)[number]["value"]) => void;
  onDetailsChange: (details: string) => void;
  onConfirm: () => void;
}) {
  const needsDetails = reason === "other";
  const ready = reason !== "" && (!needsDetails || details.trim().length >= 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-lg bg-white">
        <DialogHeader>
          <DialogTitle>Recusar pedido {order ? `#${formatShortOrderId(order.id)}` : ""}</DialogTitle>
          <DialogDescription>Informe o motivo para registrar a recusa e atualizar o consumidor.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {REJECT_REASON_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onReasonChange(option.value)}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm font-medium",
                reason === option.value
                  ? "border-[#5697E9] bg-[#edf4ff] text-[#0b2a59]"
                  : "border-[#dfe5ef] bg-white text-[#334155] hover:bg-[#f8fafc]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {needsDetails ? (
          <Textarea
            value={details}
            onChange={(event) => onDetailsChange(event.target.value)}
            placeholder="Descreva o motivo da recusa"
            className="min-h-24 rounded-md border-[#dfe5ef]"
          />
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" disabled={!ready || loading} onClick={onConfirm}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Recusar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DistributorQueueContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [rejectOrder, setRejectOrder] = useState<QueueOrder | null>(null);
  const [rejectReason, setRejectReason] = useState<(typeof REJECT_REASON_OPTIONS)[number]["value"] | "">("");
  const [rejectDetails, setRejectDetails] = useState("");
  const [selectedDriverByOrder, setSelectedDriverByOrder] = useState<Record<string, string>>({});
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
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (skipNextSearchSync.current) {
      skipNextSearchSync.current = false;
      return;
    }
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
    [activeTab, deliveryDate, driverId, origin, page, qParam, sort]
  );

  const queueQuery = useQuery<QueueResponse>({
    queryKey: ["distributor-queue", activeTab, page, qParam, origin, deliveryDate, driverId, sort],
    queryFn: () => api.get(`/api/orders?${queueQueryString}`),
    placeholderData: (previousData) => previousData,
  });

  const driversQuery = useQuery<DriverResponse>({
    queryKey: ["distributor-drivers"],
    queryFn: () => api.get("/api/distributor/drivers"),
  });

  const actionMutation = useMutation({
    mutationFn: ({ orderId, action, payload }: { orderId: string; action: QuickAction; payload?: Record<string, unknown> }) =>
      api.patch<{ order: QueueOrder }>(`/api/orders/${orderId}/${QUICK_ACTION_ROUTE[action]}`, payload ?? {}),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["distributor-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["distributor-order-detail", variables.orderId] });
      setRejectOrder(null);
      setRejectReason("");
      setRejectDetails("");
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

  const orders = queueQuery.data?.orders ?? [];
  const summary = queueQuery.data?.summary ?? SUMMARY_FALLBACK;
  const total = queueQuery.data?.total ?? 0;
  const totalPages = queueQuery.data?.totalPages ?? 0;
  const limit = queueQuery.data?.limit ?? PAGE_SIZE;
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  const hasActiveFilters = Boolean(qParam || origin !== "all" || deliveryDate || driverId !== "all" || sort !== "created_desc");
  const hasPendingSearch = search.trim().length === 1;
  const syncLabel = queueQuery.isFetching
    ? "Atualizando..."
    : queueQuery.dataUpdatedAt
      ? `Atualizado ${formatTime(new Date(queueQuery.dataUpdatedAt))}`
      : "Aguardando dados";
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedDriver = selectedOrder ? (selectedDriverByOrder[selectedOrder.id] ?? selectedOrder.driver_id ?? "") : "";
  const drivers = driversQuery.data?.drivers ?? [];
  const actionLoadingId = actionMutation.isPending ? actionMutation.variables?.orderId ?? null : null;

  const columnOrders = useMemo(() => {
    return KANBAN_COLUMNS.map((column) => ({
      ...column,
      orders: orders.filter((order) => matchesStatuses(order.status, column.statuses)),
    }));
  }, [orders]);

  function clearFilters() {
    setSearch("");
    updateQuery({ q: null, origin: null, deliveryDate: null, driverId: null, sort: null }, true);
  }

  function selectOrder(order: QueueOrder) {
    setSelectedOrderId(order.id);
    setSelectedDriverByOrder((current) => ({
      ...current,
      [order.id]: current[order.id] ?? order.driver_id ?? "",
    }));
  }

  function runAction(order: QueueOrder, action: QuickAction, payload?: Record<string, unknown>) {
    actionMutation.mutate({ orderId: order.id, action, payload });
  }

  function handleMiniAction(order: QueueOrder, action: "accept" | "reject" | "assign") {
    selectOrder(order);
    if (action === "accept") {
      runAction(order, "accept");
      return;
    }
    if (action === "reject") setRejectOrder(order);
  }

  function confirmReject() {
    if (!rejectOrder || !rejectReason) return;
    runAction(rejectOrder, "reject", {
      reason: rejectReason,
      details: rejectReason === "other" ? rejectDetails.trim() : undefined,
    });
  }

  function assignSelectedDriver() {
    if (!selectedOrder || !selectedDriver) return;
    runAction(selectedOrder, "assign_driver", { driver_id: selectedDriver });
  }

  function dispatchSelectedOrder() {
    if (!selectedOrder || !selectedDriver) return;
    runAction(selectedOrder, "dispatch", { driver_id: selectedDriver });
  }

  return (
    <div className="min-w-0 space-y-3">
      <section className="rounded-lg border border-[#d8e0eb] bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(240px,0.8fr)_minmax(320px,1fr)_auto] xl:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">Operacao da distribuidora</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-heading text-2xl font-extrabold leading-none text-[#0d1b2f]">Fila de pedidos</h1>
              <span className="rounded bg-[#eef2f7] px-2 py-1 text-xs font-semibold text-[#475569]">{syncLabel}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <QueueHeaderCard label="Aceite" value={summary.incoming} tone="border-amber-200 bg-amber-50 text-amber-900" />
            <QueueHeaderCard label="Preparo" value={summary.preparation} tone="border-sky-200 bg-sky-50 text-sky-950" />
            <QueueHeaderCard label="Em rota" value={summary.route} tone="border-emerald-200 bg-emerald-50 text-emerald-950" />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" className="h-9 rounded-md border-[#dfe5ef]" disabled={queueQuery.isFetching} onClick={() => void queueQuery.refetch()}>
              {queueQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#d8e0eb] bg-white p-2 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
        <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_170px_180px_180px_auto] xl:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pedido, cliente, telefone, item ou bairro"
              className="h-9 rounded-md border-[#dfe5ef] pl-8 text-sm"
            />
          </div>

          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
            <Input
              type="date"
              value={deliveryDate}
              onChange={(event) => updateQuery({ deliveryDate: event.target.value || null }, true)}
              className="h-9 rounded-md border-[#dfe5ef] pl-8 text-sm"
            />
          </div>

          <Select value={driverId} onValueChange={(value) => updateQuery({ driverId: value }, true)}>
            <SelectTrigger className="h-9 rounded-md border-[#dfe5ef] bg-white text-sm">
              <UserRound className="h-4 w-4 text-[#64748b]" />
              <SelectValue placeholder="Motorista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os motoristas</SelectItem>
              <SelectItem value="unassigned">Sem motorista</SelectItem>
              {drivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => updateQuery({ sort: value }, true)}>
            <SelectTrigger className="h-9 rounded-md border-[#dfe5ef] bg-white text-sm">
              <ArrowUpDown className="h-4 w-4 text-[#64748b]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">Mais recentes</SelectItem>
              <SelectItem value="delivery_asc">Entrega proxima</SelectItem>
              <SelectItem value="sla_asc">SLA primeiro</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center justify-end gap-2">
            <FilterChips options={ORIGIN_OPTIONS} value={origin} onChange={(value) => updateQuery({ origin: value }, true)} />
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="icon-sm" onClick={clearFilters} className="rounded-md text-[#64748b]">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748b]">
          <Tabs value={activeTab} onValueChange={(value) => updateQuery({ stage: value }, true)}>
            <TabsList className="h-8 rounded-md bg-[#eef2f7] p-0.5">
              {TAB_CONFIG.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="h-7 rounded px-3 text-xs data-[state=active]:bg-white">
                  {tab.label} ({getTabCount(tab.value, summary)})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-3">
            {hasPendingSearch ? <span>Busca a partir de 2 caracteres</span> : null}
            <span>Mostrando {startItem}-{endItem} de {total}</span>
          </div>
        </div>
      </section>

      {queueQuery.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {getApiErrorMessage(queueQuery.error)}
        </div>
      ) : null}

      {actionMutation.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {getApiErrorMessage(actionMutation.error)}
        </div>
      ) : null}

      {queueQuery.isLoading ? (
        <QueueSkeleton />
      ) : summary.active === 0 && !hasActiveFilters ? (
        <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-white px-6 py-10 text-center text-sm text-[#64748b]">
          Nenhum pedido ativo agora.
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-white px-6 py-10 text-center text-sm text-[#64748b]">
          Nenhum pedido encontrado para os filtros atuais.
        </div>
      ) : activeTab === "all" ? (
        <div className={cn("grid min-h-0 gap-3 xl:grid-cols-3", queueQuery.isFetching && "opacity-75")}>
          {columnOrders.map((column) => (
            <KanbanColumn
              key={column.key}
              label={column.label}
              description={column.description}
              count={column.orders.length}
              tone={column.tone}
              dot={column.dot}
              orders={column.orders}
              selectedOrderId={selectedOrderId ?? undefined}
              actionLoadingId={actionLoadingId}
              onSelect={selectOrder}
              onAction={handleMiniAction}
            />
          ))}
        </div>
      ) : (
        <div className={cn("grid min-h-0", queueQuery.isFetching && "opacity-75")}>
          {columnOrders.filter((column) => column.key === activeTab).map((column) => (
            <KanbanColumn
              key={column.key}
              label={column.label}
              description={column.description}
              count={column.orders.length}
              tone={column.tone}
              dot={column.dot}
              orders={column.orders}
              selectedOrderId={selectedOrderId ?? undefined}
              actionLoadingId={actionLoadingId}
              onSelect={selectOrder}
              onAction={handleMiniAction}
            />
          ))}
        </div>
      )}

      {total > 0 ? (
        <footer className="flex items-center justify-between rounded-lg border border-[#d8e0eb] bg-white px-3 py-2 text-sm text-[#64748b]">
          <span>{limit} pedidos por pagina - {totalPages} pagina{totalPages === 1 ? "" : "s"}</span>
          <Pagination page={page} totalPages={totalPages} onPageChange={(nextPage) => updateQuery({ page: String(nextPage) }, false)} />
        </footer>
      ) : null}

      <OrderDetailSheet
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        drivers={drivers}
        actionLoading={actionMutation.isPending}
        actionError={actionMutation.error ? getApiErrorMessage(actionMutation.error) : null}
        selectedDriver={selectedDriver}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
        onDriverChange={(nextDriver) => {
          if (!selectedOrder) return;
          setSelectedDriverByOrder((current) => ({ ...current, [selectedOrder.id]: nextDriver }));
        }}
        onAccept={() => {
          if (selectedOrder) runAction(selectedOrder, "accept");
        }}
        onAssign={assignSelectedDriver}
        onDispatch={dispatchSelectedOrder}
        onRejectClick={() => {
          if (selectedOrder) setRejectOrder(selectedOrder);
        }}
      />

      <RejectDialog
        open={Boolean(rejectOrder)}
        order={rejectOrder}
        reason={rejectReason}
        details={rejectDetails}
        loading={actionMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setRejectOrder(null);
        }}
        onReasonChange={setRejectReason}
        onDetailsChange={setRejectDetails}
        onConfirm={confirmReject}
      />
    </div>
  );
}

export default function DistributorQueuePage() {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <DistributorQueueContent />
    </Suspense>
  );
}
