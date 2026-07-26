import type { ReactNode } from "react";
import {
  Banknote,
  CalendarDays,
  Mail,
  MapPin,
  MessageSquareText,
  Package2,
  Phone,
  Repeat2,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { StatusPill } from "@/src/components/shared/status-pill";
import { cn, formatCurrency, formatDate, formatTime } from "@/src/lib/utils";
import { isCashPaymentMethod } from "@xua/shared/mappers/payment";
import type { OrderDetail } from "@/src/types/order-detail";
import {
  DELIVERY_STEPS,
  TERMINAL_ISSUE_STATUSES,
  formatEventLabel,
  formatScheduledTime,
  formatShortOrderId,
  formatSubscriptionProgress,
  formatSubscriptionStatus,
  getOperationalMessage,
  getStatusStepIndex,
  isFromSubscription,
  matchesStatuses,
} from "@/src/lib/order-detail-format";

function SectionCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-[#dfe5ef] bg-white p-3.5", className)}>
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">{children}</p>
  );
}

export function OrderStatusHeader({ order }: { order: OrderDetail }) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Pedido #{formatShortOrderId(order.id)}</SectionLabel>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} />
            <span className="text-xs text-[#64748b]">Criado às {formatTime(order.created_at)}</span>
          </div>
        </div>
        <p className="text-right font-heading text-xl font-extrabold text-[#0d1b2f]">
          {formatCurrency(order.total_cents)}
        </p>
      </div>
    </SectionCard>
  );
}

export function OrderCustomerSection({ order }: { order: OrderDetail }) {
  return (
    <SectionCard>
      <SectionLabel>Cliente e entrega</SectionLabel>
      <h3 className="mt-1 font-heading text-base font-bold text-[#0d1b2f]">{order.consumer_name}</h3>

      <div className="mt-3 grid gap-2 text-sm text-[#334155] sm:grid-cols-2">
        <div className="flex items-start gap-2 sm:col-span-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#64748b]" />
          <div>
            <p className="font-medium text-[#0d1b2f]">
              {order.address_details.street}, {order.address_details.number}
              {order.address_details.complement ? ` • ${order.address_details.complement}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-[#64748b]">
              {[
                order.address_details.neighborhood,
                `${order.address_details.city}/${order.address_details.state}`,
                order.address_details.zip_code ? `CEP ${order.address_details.zip_code}` : null,
              ]
                .filter(Boolean)
                .join(" • ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[#64748b]" />
          <span>
            {formatDate(order.delivery_date)} • {formatScheduledTime(order)}
          </span>
        </div>

        {order.consumer_phone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-[#64748b]" />
            <span>{order.consumer_phone}</span>
          </div>
        ) : null}

        {order.consumer_email ? (
          <div className="flex items-center gap-2 sm:col-span-2">
            <Mail className="h-4 w-4 shrink-0 text-[#64748b]" />
            <span className="break-all">{order.consumer_email}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 shrink-0 text-[#64748b]" />
          <span>{order.driver_name ? `Motorista: ${order.driver_name}` : "Sem motorista atribuído"}</span>
        </div>
      </div>
    </SectionCard>
  );
}

export function OrderInstructionsSection({ order }: { order: OrderDetail }) {
  if (!order.delivery_instructions) return null;

  return (
    <SectionCard className="border-amber-200 bg-amber-50/60">
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <SectionLabel>Observações do cliente</SectionLabel>
          <p className="mt-1 text-sm text-[#4b3b0f]">{order.delivery_instructions}</p>
        </div>
      </div>
    </SectionCard>
  );
}

export function OrderItemsSection({ order }: { order: OrderDetail }) {
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>
          Itens ({order.total_items_qty} {order.total_items_qty === 1 ? "item" : "itens"})
        </SectionLabel>
        <span className="rounded bg-[#eef2f7] px-2 py-0.5 text-xs font-semibold text-[#475569]">
          {order.items.length} produto{order.items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-2.5 space-y-2">
        {order.items.map((item, index) => (
          <div
            key={`${item.product_name}-${index}`}
            className="flex items-center gap-2.5 rounded-md bg-[#f7f8fb] px-2.5 py-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#5697E9]/15 text-[#1B4A9A]">
              <Package2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#0d1b2f]">{item.product_name}</p>
              <p className="text-xs text-[#64748b]">
                {item.qty}x {formatCurrency(item.unit_price_cents)}
              </p>
            </div>
            <p className="text-sm font-semibold text-[#0d1b2f]">{formatCurrency(item.subtotal_cents)}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function OrderPaymentSection({ order }: { order: OrderDetail }) {
  const latestPayment = order.payments[0] ?? null;
  const isCashPayment = isCashPaymentMethod(latestPayment?.payment_method);

  return (
    <SectionCard className="bg-[#0d1b2f] text-white">
      <SectionLabel>
        <span className="text-white/60">Total do pedido</span>
      </SectionLabel>
      <p className="mt-1 font-heading text-2xl font-extrabold">{formatCurrency(order.total_cents)}</p>

      <div className="mt-3 grid gap-1.5 text-sm">
        <div className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5 text-white/80">
          <span>Subtotal</span>
          <span>{formatCurrency(order.subtotal_cents)}</span>
        </div>
        {order.bottles_sold > 0 && order.total_cents > order.subtotal_cents ? (
          <div className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5 text-white/80">
            <span>Vasilhames ({order.bottles_sold})</span>
            <span>{formatCurrency(order.total_cents - order.subtotal_cents)}</span>
          </div>
        ) : null}
        {order.bottles_loaned > 0 ? (
          <div className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5 text-white/80">
            <span>Em caução</span>
            <span>{order.bottles_loaned}</span>
          </div>
        ) : null}
        {isCashPayment ? (
          <div className="mt-1 rounded-md bg-white/10 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#ffe099]" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Dinheiro na entrega</p>
                <p className="mt-0.5 text-xs text-white/70">
                  {latestPayment?.cash_change_for_cents == null
                    ? "Motorista deve receber valor exato."
                    : `Troco para ${formatCurrency(latestPayment.cash_change_for_cents)}.`}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function OrderSubscriptionSection({ order }: { order: OrderDetail }) {
  const fromSubscription = isFromSubscription(order);
  const OriginIcon = fromSubscription ? Repeat2 : ShoppingCart;
  const subscriptionProgress = formatSubscriptionProgress(order);
  const completedDeliveries = order.completed_deliveries ?? 0;
  const remainingDeliveries = order.remaining_after_current ?? order.remaining_deliveries ?? 0;

  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Origem</SectionLabel>
          <h3 className="mt-1 font-heading text-base font-bold text-[#0d1b2f]">
            {fromSubscription ? "Assinatura" : "Carrinho"}
          </h3>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf4ff] text-[#0b2a59]">
          <OriginIcon className="h-4 w-4" />
        </div>
      </div>

      {fromSubscription ? (
        <div className="mt-3 space-y-2 text-sm text-[#334155]">
          <div className="rounded-md bg-[#f7f8fb] px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Plano</p>
            <p className="mt-0.5 font-medium text-[#0d1b2f]">{order.subscription_plan_name ?? "Assinatura"}</p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-md bg-[#edf4ff] px-2 py-1.5 text-[#0b2a59]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4d668a]">Atual</p>
              <p className="mt-0.5 font-heading text-base font-extrabold">{subscriptionProgress ?? "-"}</p>
            </div>
            <div className="rounded-md bg-[#e7f7ef] px-2 py-1.5 text-[#166534]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4f7a5e]">Feitas</p>
              <p className="mt-0.5 font-heading text-base font-extrabold">{completedDeliveries}</p>
            </div>
            <div className="rounded-md bg-[#fff2dd] px-2 py-1.5 text-[#7a4700]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#a0620a]">Restam</p>
              <p className="mt-0.5 font-heading text-base font-extrabold">{remainingDeliveries}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-md bg-[#f7f8fb] px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Qtd. desta</p>
              <p className="mt-0.5 font-medium text-[#0d1b2f]">{order.quantity_for_this_delivery ?? "-"}</p>
            </div>
            <div className="rounded-md bg-[#f7f8fb] px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Status</p>
              <p className="mt-0.5 font-medium text-[#0d1b2f]">{formatSubscriptionStatus(order.subscription_status)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-md bg-[#f7f8fb] px-2.5 py-2 text-sm font-medium text-[#4b5565]">
          Compra avulsa feita pelo carrinho.
        </p>
      )}
    </SectionCard>
  );
}

export function OrderDeliveryStepsSection({ order }: { order: OrderDetail }) {
  const currentStepIndex = getStatusStepIndex(order.status);
  const hasTerminalIssue = matchesStatuses(order.status, TERMINAL_ISSUE_STATUSES);

  return (
    <SectionCard>
      <SectionLabel>Status da entrega</SectionLabel>

      <div className="mt-4 flex items-start pb-1">
        {DELIVERY_STEPS.map((step, index) => {
          const isDone = !hasTerminalIssue && index < currentStepIndex;
          const isCurrent = !hasTerminalIssue && index === currentStepIndex;

          return (
            <div key={step.key} className="relative flex-1 min-w-0">
              {index < DELIVERY_STEPS.length - 1 ? (
                <span
                  className={cn(
                    "absolute left-[calc(50%+0.65rem)] right-[calc(-50%+0.65rem)] top-3 h-px",
                    isDone ? "bg-primary" : "bg-[#d9dde6]"
                  )}
                />
              ) : null}

              <div className="relative z-10 flex flex-col items-center text-center">
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                    isDone
                      ? "border-[#00E0FF] bg-[#00E0FF] text-[#001735]"
                      : isCurrent
                        ? "border-[#5697E9]/40 bg-[#5697E9]/10 text-[#1B4A9A]"
                        : "border-[#d9dde6] bg-[#f7f8fb] text-[#8a91a1]"
                  )}
                >
                  {index + 1}
                </div>
                <p className="mt-1 text-[10px] font-medium leading-tight text-[#4b5565]">{step.shortLabel}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-md bg-[#f7f8fb] px-2.5 py-2 text-sm text-[#4b5565]">
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#64748b]" />
          <p>{getOperationalMessage(order.status)}</p>
        </div>
      </div>
    </SectionCard>
  );
}

export function OrderTimelineSection({ order }: { order: OrderDetail }) {
  if (order.events.length === 0) return null;

  return (
    <SectionCard>
      <SectionLabel>Histórico operacional</SectionLabel>
      <div className="mt-3 space-y-3">
        {order.events.map((event, index) => (
          <div key={`${event.status}-${event.timestamp}-${index}`} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              {index < order.events.length - 1 ? <div className="mt-1 h-full w-px bg-[#d9dde6]" /> : null}
            </div>
            <div className="pb-2.5">
              <p className="text-sm font-medium text-[#0d1b2f]">{formatEventLabel(event.status)}</p>
              <p className="mt-0.5 text-xs text-[#64748b]">
                {formatDate(event.timestamp)} às {formatTime(event.timestamp)}
                {event.actor_type ? ` • ${event.actor_type.toLowerCase()}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
