"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { cn, formatCurrency, formatDate, formatTime } from "@/src/lib/utils";
import { OrderStatus } from "@/src/types/enums";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronRight,
  Mail,
  MapPin,
  Package2,
  Phone,
  Repeat2,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { Order } from "@/src/types";
import { isCashPaymentMethod } from "@xua/shared/mappers/payment";

interface DetailEvent {
  status: string;
  timestamp: string;
  actor?: string | null;
}

interface PaymentSummary {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  payment_method?: string | null;
  cash_change_for_cents?: number | null;
}

interface OrderDetail extends Order {
  items: {
    product_name: string;
    qty: number;
    unit_price_cents: number;
    subtotal_cents: number;
    image_url?: string | null;
  }[];
  events: DetailEvent[];
  payments: PaymentSummary[];
  consumer_name: string;
  address_details: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood?: string | null;
    city: string;
    state: string;
    zip_code?: string | null;
  };
  consumer_email?: string | null;
  consumer_phone?: string | null;
  sla_deadline?: string | null;
  total_items_qty: number;
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

const REJECT_REASON_OPTIONS = [
  { value: "out_of_stock", label: "Falta de estoque" },
  { value: "delivery_area_issue", label: "Endereço fora da operação" },
  { value: "operational_capacity", label: "Capacidade operacional esgotada" },
  { value: "other", label: "Outro motivo" },
] as const;

const DELIVERY_STEPS = [
  { key: "received", label: "Recebido", shortLabel: "Receb." },
  { key: "accepted", label: "Aceite", shortLabel: "Aceite" },
  { key: "dispatch", label: "Despacho", shortLabel: "Desp." },
  { key: "route", label: "Em rota", shortLabel: "Rota" },
  { key: "done", label: "Concluído", shortLabel: "Concl." },
] as const;

const TERMINAL_ISSUE_STATUSES = [
  OrderStatus.REJECTED_BY_DISTRIBUTOR,
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERY_FAILED,
] as const;

const EVENT_LABELS: Record<string, string> = {
  ORDER_CREATED: "Pedido criado",
  ORDER_CONFIRMED: "Pagamento confirmado",
  ORDER_RECEIVED_BY_DISTRIBUTOR: "Recebido pela distribuidora",
  ORDER_ACCEPTED_BY_DISTRIBUTOR: "Aceito pela distribuidora",
  ORDER_REJECTED_BY_DISTRIBUTOR: "Recusado pela distribuidora",
  DISPATCH_CHECKLIST_COMPLETED: "Checklist concluído",
  ORDER_DISPATCHED: "Pedido despachado",
  ORDER_DELIVERED: "Pedido entregue",
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pagamento pendente",
  pending_payment: "Pagamento pendente",
  ACTIVE: "Ativa",
  active: "Ativa",
  PAUSED: "Pausada",
  paused: "Pausada",
  CANCELLED: "Cancelada",
  cancelled: "Cancelada",
  COMPLETED: "Concluída",
  completed: "Concluída",
};

function formatWindowLabel(window: OrderDetail["delivery_window"]) {
  return window === "MORNING" ? "Manhã (08:00-12:00)" : "Tarde (13:00-18:00)";
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * Exibe o horário priorizando o snapshot imutável gravado no pedido.
 * Fallback para janela genérica em pedidos antigos (pré-snapshot).
 */
function formatScheduledTime(order: OrderDetail) {
  if (order.scheduled_time_label) return order.scheduled_time_label;
  if (
    order.scheduled_time_start_hour != null &&
    order.scheduled_time_end_hour != null
  ) {
    const sm = order.scheduled_time_start_minute ?? 0;
    const em = order.scheduled_time_end_minute ?? 0;
    return `${pad2(order.scheduled_time_start_hour)}:${pad2(sm)}–${pad2(order.scheduled_time_end_hour)}:${pad2(em)}`;
  }
  return formatWindowLabel(order.delivery_window);
}

function formatShortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function isFromSubscription(order: OrderDetail) {
  return order.order_origin === "subscription";
}

function formatSubscriptionProgress(order: OrderDetail) {
  if (order.delivery_sequence == null || order.total_deliveries == null) return null;
  return `Entrega ${order.delivery_sequence}/${order.total_deliveries}`;
}

function formatEventLabel(status: string) {
  return EVENT_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ");
}

function formatSubscriptionStatus(status?: string | null) {
  if (!status) return "-";
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ");
}

function matchesStatuses(status: string, statuses: readonly string[]) {
  return statuses.includes(status);
}

function getStatusStepIndex(status: OrderDetail["status"]) {
  switch (status) {
    case OrderStatus.SENT_TO_DISTRIBUTOR:
      return 0;
    case OrderStatus.ACCEPTED_BY_DISTRIBUTOR:
      return 1;
    case OrderStatus.READY_FOR_DISPATCH:
      return 2;
    case OrderStatus.OUT_FOR_DELIVERY:
      return 3;
    case OrderStatus.DELIVERED:
      return 4;
    default:
      return 0;
  }
}

function getOperationalMessage(order: OrderDetail) {
  switch (order.status) {
    case OrderStatus.REJECTED_BY_DISTRIBUTOR:
      return "Pedido recusado. O consumidor já deve receber a atualização deste status.";
    case OrderStatus.OUT_FOR_DELIVERY:
      return "Pedido já despachado. Agora o acompanhamento principal acontece na fila de entregas do motorista.";
    case OrderStatus.DELIVERED:
      return "Pedido concluído com sucesso. Esta tela permanece apenas para consulta operacional.";
    case OrderStatus.READY_FOR_DISPATCH:
      return "Checklist concluído e pedido pronto para despacho.";
    default:
      return "Revise os dados do pedido e avance somente quando a etapa operacional estiver concluída.";
  }
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-[32px] bg-white p-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
        <div className="h-3 w-28 rounded-full bg-[#e1e3e4]" />
        <div className="mt-4 h-9 w-48 rounded-full bg-[#e1e3e4]" />
        <div className="mt-3 h-4 w-full rounded-full bg-[#eef0f3]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
            <div className="h-3 w-24 rounded-full bg-[#e1e3e4]" />
            <div className="mt-4 h-4 w-full rounded-full bg-[#eef0f3]" />
            <div className="mt-3 h-4 w-5/6 rounded-full bg-[#eef0f3]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DistributorOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState<(typeof REJECT_REASON_OPTIONS)[number]["value"] | "">("");
  const [rejectDetails, setRejectDetails] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? `Erro ${response.status}`);
      }
      setOrder(data.order ?? null);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao carregar pedido");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  async function handleAction(action: string, body?: Record<string, unknown>) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${id}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      // Após aceite, redireciona direto para o checklist
      if (action === "accept") {
        router.push(`/distributor/orders/${id}/checklist`);
        return;
      }
      if (action === "reject") {
        router.push("/distributor/queue");
        return;
      }
      router.refresh();
      await loadOrder();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <DetailSkeleton />;
  if (!order) return <p className="text-destructive">Pedido não encontrado.</p>;

  const canAccept = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const canReject = order.status === OrderStatus.SENT_TO_DISTRIBUTOR;
  const canProceedToChecklist = order.status === OrderStatus.ACCEPTED_BY_DISTRIBUTOR;
  const rejectNeedsDetails = rejectReason === "other";
  const rejectReady = rejectReason !== "" && (!rejectNeedsDetails || rejectDetails.trim().length >= 10);
  const currentStepIndex = getStatusStepIndex(order.status);
  const hasTerminalIssue = matchesStatuses(order.status, TERMINAL_ISSUE_STATUSES);
  const fromSubscription = isFromSubscription(order);
  const OriginIcon = fromSubscription ? Repeat2 : ShoppingCart;
  const subscriptionProgress = formatSubscriptionProgress(order);
  const completedDeliveries = order.completed_deliveries ?? 0;
  const remainingDeliveries = order.remaining_after_current ?? order.remaining_deliveries ?? 0;
  const latestPayment = order.payments[0] ?? null;
  const isCashPayment = isCashPaymentMethod(latestPayment?.payment_method);

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <section className="rounded-[24px] sm:rounded-[32px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
        <button
          type="button"
          onClick={() => router.push("/distributor/queue")}
          className="inline-flex items-center gap-2 rounded-full bg-[#f3f4f5] px-3 py-1.5 text-sm font-medium text-[#425066] transition-colors hover:bg-[#e7eaef]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para fila
        </button>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Pedido da operação</p>
            <h1 className="mt-2 font-heading text-xl sm:text-[2rem] leading-tight font-extrabold text-[#0d1b2f]">
              Pedido #{formatShortOrderId(order.id)}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#5d6473]">
              {order.consumer_name} • Entrega em {formatDate(order.delivery_date)} • Horário {formatScheduledTime(order)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} className="bg-[#edf4ff] text-[#0b2a59]" />
            <p className="text-sm text-[#5d6473]">Criado às {formatTime(order.created_at)}</p>
          </div>
        </div>

      </section>

      <section className="rounded-[20px] sm:rounded-[28px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Ações operacionais</p>
            <h2 className="mt-2 font-heading text-xl sm:text-2xl font-extrabold text-[#0d1b2f]">Próximo passo</h2>
          </div>
          <ChevronRight className="h-5 w-5 text-[#7d8494]" />
        </div>

        <p className="mt-2 text-sm leading-relaxed text-[#5d6473]">{getOperationalMessage(order)}</p>

        {actionError ? (
          <p className="mt-3 rounded-2xl bg-[#fff3f1] px-3 py-3 text-sm text-[#8a1c14]">{actionError}</p>
        ) : null}

        <div className="mt-4 space-y-3">
          {canAccept ? (
            <Button
              className="h-12 w-full rounded-[20px] bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] text-base font-semibold shadow-none hover:opacity-90"
              disabled={actionLoading}
              onClick={() => handleAction("accept")}
            >
              Aceitar e seguir para checklist
            </Button>
          ) : null}

          {canProceedToChecklist ? (
            <Button
              className="h-12 w-full rounded-[20px] bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] text-base font-semibold shadow-none active:scale-[0.98]"
              onClick={() => router.push(`/distributor/orders/${id}/checklist`)}
            >
              Ir para checklist de despacho
            </Button>
          ) : null}

          {canReject ? (
            <div className="space-y-3 rounded-[24px] bg-[#fafbfc] p-3.5">
              <p className="text-sm font-semibold text-[#0d1b2f]">Se recusar, informe o motivo</p>
              <div className="grid grid-cols-2 gap-2">
                {REJECT_REASON_OPTIONS.map((option) => {
                  const active = rejectReason === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRejectReason(option.value)}
                      className={cn(
                        "rounded-[18px] border px-3 py-2.5 text-left text-sm transition-all",
                        active
                          ? "border-[#5697E9] bg-[#5697E9]/10 text-[#0b2a59]"
                          : "border-[#e1e3e4] bg-white text-[#334155] hover:border-[#bfd2ff]"
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {rejectNeedsDetails ? (
                <Textarea
                  placeholder="Descreva o motivo da recusa"
                  value={rejectDetails}
                  onChange={(event) => setRejectDetails(event.target.value)}
                  className="min-h-24 rounded-[18px] border-[#d9dde3] bg-white"
                />
              ) : null}

              <Button
                variant="destructive"
                className="h-11 w-full rounded-[18px] shadow-none"
                disabled={actionLoading || !rejectReady}
                onClick={() =>
                  handleAction("reject", {
                    reason: rejectReason,
                    details: rejectNeedsDetails ? rejectDetails.trim() : undefined,
                  })
                }
              >
                Recusar pedido
              </Button>
            </div>
          ) : null}

          {!canAccept && !canReject && !canProceedToChecklist ? (
            <div className="rounded-[24px] bg-[#f7f8fb] px-4 py-4 text-sm text-[#4b5565]">
              {getOperationalMessage(order)}
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4 sm:space-y-5">
          <section className="rounded-[20px] sm:rounded-[28px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Informações do cliente</p>
            <h2 className="mt-2 font-heading text-xl sm:text-2xl font-extrabold text-[#0d1b2f]">{order.consumer_name}</h2>

            <div className="mt-4 grid gap-2 text-sm text-[#334155] sm:grid-cols-2">
              <div className="rounded-[18px] bg-[#f7f8fb] px-3 py-3 sm:col-span-2">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#7d8494]" />
                  <div>
                    <p className="font-medium text-[#0d1b2f]">
                      {order.address_details.street}, {order.address_details.number}
                      {order.address_details.complement ? ` • ${order.address_details.complement}` : ""}
                    </p>
                    <p className="mt-1 text-[#5d6473]">
                      {[order.address_details.neighborhood, `${order.address_details.city}/${order.address_details.state}`, order.address_details.zip_code ? `CEP ${order.address_details.zip_code}` : null]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[18px] bg-[#f7f8fb] px-3 py-3">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#7d8494]" />
                  <div>
                    <p className="font-medium text-[#0d1b2f]">{formatDate(order.delivery_date)}</p>
                    <p className="mt-1 text-[#5d6473]">Horário de entrega: {formatScheduledTime(order)}</p>
                  </div>
                </div>
              </div>

              {order.consumer_phone ? (
                <div className="rounded-[18px] bg-[#f7f8fb] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 shrink-0 text-[#7d8494]" />
                    <span>{order.consumer_phone}</span>
                  </div>
                </div>
              ) : null}

              {order.consumer_email ? (
                <div className={cn("rounded-[18px] bg-[#f7f8fb] px-3 py-3", order.consumer_phone ? "" : "sm:col-span-2")}>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 shrink-0 text-[#7d8494]" />
                    <span className="break-all">{order.consumer_email}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[20px] sm:rounded-[28px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Itens do pedido</p>
                <h2 className="mt-2 font-heading text-xl sm:text-2xl font-extrabold text-[#0d1b2f]">{order.total_items_qty} item{order.total_items_qty === 1 ? "" : "ns"}</h2>
              </div>
              <span className="rounded-full bg-[#5697E9]/10 px-3 py-1 text-sm font-semibold text-primary">
                {order.items.length} produto{order.items.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {order.items.map((item, index) => (
                <div key={`${item.product_name}-${index}`} className="flex items-center gap-3 rounded-[18px] sm:rounded-[24px] bg-[#f7f8fb] px-3 py-3 sm:px-4 sm:py-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#5697E9]/15 text-[#1B4A9A]">
                    <Package2 className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#0d1b2f]">{item.product_name}</p>
                    <p className="mt-1 text-xs text-[#5d6473]">
                      {item.qty}x {formatCurrency(item.unit_price_cents)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#0d1b2f]">{formatCurrency(item.subtotal_cents)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {order.events.length > 0 ? (
            <section className="rounded-[20px] sm:rounded-[28px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Histórico operacional</p>
              <div className="mt-5 space-y-4">
                {order.events.map((event, index) => (
                  <div key={`${event.status}-${event.timestamp}-${index}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-primary" />
                      {index < order.events.length - 1 ? <div className="mt-1 h-full w-px bg-[#d9dde6]" /> : null}
                    </div>

                    <div className="pb-2">
                      <p className="font-medium text-[#0d1b2f]">{formatEventLabel(event.status)}</p>
                      <p className="mt-1 text-xs text-[#5d6473]">
                        {formatDate(event.timestamp)} às {formatTime(event.timestamp)}
                      </p>
                      {event.actor ? <p className="mt-1 text-xs text-[#7d8494]">Ator: {event.actor}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-4 sm:space-y-5">
          <section className="rounded-[20px] sm:rounded-[28px] bg-[#0d1b2f] px-4 py-4 sm:px-5 sm:py-5 text-white shadow-[0_18px_44px_rgba(0,26,64,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">Total do pedido</p>
            <p className="mt-3 font-heading text-3xl sm:text-4xl font-extrabold">{formatCurrency(order.total_cents)}</p>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 rounded-[14px] bg-white/5 px-3 py-2 text-white/78">
                <span className="shrink-0">Subtotal</span>
                <span className="shrink-0">{formatCurrency(order.subtotal_cents)}</span>
              </div>
              {order.bottles_sold > 0 && order.total_cents > order.subtotal_cents ? (
                <div className="flex items-center justify-between gap-2 rounded-[14px] bg-white/5 px-3 py-2 text-white/78">
                  <span className="shrink-0">Vasilhames ({order.bottles_sold})</span>
                  <span className="shrink-0">{formatCurrency(order.total_cents - order.subtotal_cents)}</span>
                </div>
              ) : null}
              {order.bottles_loaned > 0 ? (
                <div className="flex items-center justify-between gap-2 rounded-[14px] bg-white/5 px-3 py-2 text-white/78">
                  <span className="shrink-0">Em caução</span>
                  <span className="shrink-0">{order.bottles_loaned}</span>
                </div>
              ) : null}
              {isCashPayment ? (
                <div className="rounded-[18px] bg-white/10 px-3 py-3 text-white sm:col-span-2">
                  <div className="flex items-start gap-2">
                    <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#ffe099]" />
                    <div className="min-w-0">
                      <p className="font-semibold">Dinheiro na entrega</p>
                      <p className="mt-1 text-xs text-white/72">
                        {latestPayment.cash_change_for_cents == null
                          ? "Motorista deve receber valor exato."
                          : `Troco para ${formatCurrency(latestPayment.cash_change_for_cents)}.`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[20px] sm:rounded-[28px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Origem do pedido</p>
                <h2 className="mt-2 font-heading text-xl sm:text-2xl font-extrabold text-[#0d1b2f]">
                  {fromSubscription ? "Assinatura" : "Carrinho"}
                </h2>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#0b2a59]">
                <OriginIcon className="h-5 w-5" />
              </div>
            </div>

            {fromSubscription ? (
              <div className="mt-5 space-y-3 text-sm text-[#334155]">
                <div className="rounded-[18px] sm:rounded-[24px] bg-[#f7f8fb] px-3 py-3 sm:px-4 sm:py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d8494]">Plano</p>
                  <p className="mt-1 font-semibold text-[#0d1b2f]">{order.subscription_plan_name ?? "Assinatura"}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[18px] bg-[#edf4ff] px-3 py-3 text-[#0b2a59]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4d668a]">Atual</p>
                    <p className="mt-1 font-heading text-lg font-extrabold">{subscriptionProgress ?? "-"}</p>
                  </div>
                  <div className="rounded-[18px] bg-[#e7f7ef] px-3 py-3 text-[#166534]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f7a5e]">Feitas</p>
                    <p className="mt-1 font-heading text-lg font-extrabold">{completedDeliveries}</p>
                  </div>
                  <div className="rounded-[18px] bg-[#fff2dd] px-3 py-3 text-[#7a4700]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a0620a]">Restam</p>
                    <p className="mt-1 font-heading text-lg font-extrabold">{remainingDeliveries}</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[18px] bg-[#f7f8fb] px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d8494]">Qtd. desta</p>
                    <p className="mt-1 font-semibold text-[#0d1b2f]">{order.quantity_for_this_delivery ?? "-"}</p>
                  </div>
                  <div className="rounded-[18px] bg-[#f7f8fb] px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d8494]">Status</p>
                    <p className="mt-1 font-semibold text-[#0d1b2f]">{formatSubscriptionStatus(order.subscription_status)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-[18px] bg-[#f7f8fb] px-3 py-3 text-sm font-medium text-[#4b5565]">
                Compra avulsa feita pelo carrinho.
              </p>
            )}
          </section>

          <section className="rounded-[20px] sm:rounded-[28px] bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7d8494]">Status da entrega</p>

            <div className="mt-4 flex items-start pb-1">
              {DELIVERY_STEPS.map((step, index) => {
                const isDone = !hasTerminalIssue && index < currentStepIndex;
                const isCurrent = !hasTerminalIssue && index === currentStepIndex;

                return (
                  <div key={step.key} className="relative flex-1 min-w-0">
                    {index < DELIVERY_STEPS.length - 1 ? (
                      <span
                        className={cn(
                          "absolute left-[calc(50%+0.75rem)] right-[calc(-50%+0.75rem)] top-3.5 sm:top-5 h-px",
                          isDone ? "bg-primary" : "bg-[#d9dde6]"
                        )}
                      />
                    ) : null}

                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div
                        className={cn(
                          "flex h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-full border text-[11px] sm:text-sm font-semibold",
                          isDone
                            ? "border-[#00E0FF] bg-[#00E0FF] text-[#001735]"
                            : isCurrent
                              ? "border-[#5697E9]/40 bg-[#5697E9]/10 text-[#1B4A9A]"
                              : "border-[#d9dde6] bg-[#f7f8fb] text-[#8a91a1]"
                        )}
                      >
                        {index + 1}
                      </div>
                      <p className="mt-1 text-[9px] sm:text-xs font-medium text-[#4b5565] leading-tight sm:hidden">{step.shortLabel}</p>
                      <p className="mt-1.5 hidden text-xs font-medium text-[#4b5565] leading-tight sm:block">{step.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-[18px] sm:rounded-[24px] bg-[#f7f8fb] px-3 py-3 sm:px-4 sm:py-4 text-sm text-[#4b5565]">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#7d8494]" />
                <p>{getOperationalMessage(order)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
