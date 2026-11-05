import type { ReactNode } from "react";
import { Banknote, CalendarDays, Check, CreditCard, Mail, MapPin, MessageCircle, MessageSquareText, Phone, Recycle, Repeat2, Truck } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { cn, formatCurrency, formatDate, formatTime } from "@/src/lib/utils";
import { formatPhone, phoneHref, plural, whatsappHref } from "@/src/lib/format";
import { isCashPaymentMethod, isOfflinePaymentMethod } from "@xua/shared/mappers/payment";
import type { OrderDetail } from "@/src/types/order-detail";
import {
  formatEventLabel,
  formatScheduledTime,
  formatShortOrderId,
  formatSubscriptionProgress,
  formatSubscriptionStatus,
  getOperationalMessage,
  isFromSubscription,
} from "@/src/lib/order-detail-format";
import { OPS_ORDER_STEPS, actorTypeLabel, opsStepsDone } from "@/src/lib/order-status";

export function SectionCard({ className, title, children }: { className?: string; title?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-hairline bg-card p-4", className)}>
      {title ? <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Topo do pedido: status, andamento e total — o que importa para decidir a próxima ação. */
export function OrderStatusHeader({ order }: { order: OrderDetail }) {
  const done = opsStepsDone(order.status);
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <StatusBadge status={order.status} audience="ops" />
          <p className="text-xs text-muted-foreground">
            Pedido #{formatShortOrderId(order.id)} · criado {formatDate(order.created_at)} às {formatTime(order.created_at)}
          </p>
        </div>
        <p className="font-heading text-2xl font-bold text-ink tabular-nums">{formatCurrency(order.total_cents)}</p>
      </div>

      {done !== null ? (
        <ol aria-label="Andamento" className="mt-4 grid grid-cols-4 gap-1">
          {OPS_ORDER_STEPS.map((label, index) => {
            const isDone = index < done;
            const isCurrent = index === done;
            return (
              <li key={label} className="flex flex-col gap-1.5" aria-current={isCurrent ? "step" : undefined}>
                <span className={cn("h-1.5 rounded-full", isDone ? "bg-primary" : isCurrent ? "bg-sky/50" : "bg-surface-highest")} />
                <span
                  className={cn(
                    "flex items-center gap-1 text-[11px] leading-tight",
                    isCurrent ? "font-semibold text-primary" : isDone ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="size-3" aria-hidden /> : null}
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="mt-3 text-sm text-muted-foreground">{getOperationalMessage(order.status)}</p>
    </SectionCard>
  );
}

export function OrderCustomerSection({ order }: { order: OrderDetail }) {
  const tel = phoneHref(order.consumer_phone);
  const chat = whatsappHref(order.consumer_phone);
  return (
    <SectionCard title="Cliente e entrega">
      <p className="font-heading text-base font-bold text-ink">{order.consumer_name}</p>
      <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">
              {order.address_details.street}, {order.address_details.number}
              {order.address_details.complement ? ` · ${order.address_details.complement}` : ""}
            </span>
            <span className="block text-xs">
              {[order.address_details.neighborhood, `${order.address_details.city}/${order.address_details.state}`, order.address_details.zip_code ? `CEP ${order.address_details.zip_code}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </p>
        <p className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          {formatDate(order.delivery_date)} · {formatScheduledTime(order)}
        </p>
        <p className="flex items-center gap-2">
          <Truck className="size-4 shrink-0" aria-hidden />
          {order.driver_name ? `Motorista: ${order.driver_name}` : "Sem motorista ainda"}
        </p>
        {order.consumer_email ? (
          <a href={`mailto:${order.consumer_email}`} className="flex items-center gap-2 break-all text-primary hover:underline">
            <Mail className="size-4 shrink-0" aria-hidden /> {order.consumer_email}
          </a>
        ) : null}
      </div>
      {tel || chat ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tel ? (
            <Button asChild variant="soft" size="lg">
              <a href={tel} aria-label={`Ligar para ${order.consumer_name}`}>
                <Phone /> {formatPhone(order.consumer_phone)}
              </a>
            </Button>
          ) : null}
          {chat ? (
            <Button asChild variant="soft" size="lg">
              <a href={chat} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

export function OrderInstructionsSection({ order }: { order: OrderDetail }) {
  if (!order.delivery_instructions) return null;
  return (
    <section className="flex items-start gap-3 rounded-2xl bg-warning-surface p-4 text-warning-foreground">
      <MessageSquareText className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="text-sm font-semibold">Recado do cliente</p>
        <p className="text-sm">{order.delivery_instructions}</p>
      </div>
    </section>
  );
}

export function OrderItemsSection({ order }: { order: OrderDetail }) {
  return (
    <SectionCard title={`Itens (${plural(order.total_items_qty, "unidade", "unidades")})`}>
      <ul className="divide-y divide-hairline">
        {order.items.map((item, index) => (
          <li key={`${item.product_name}-${index}`} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-secondary px-1.5 font-heading font-bold text-primary tabular-nums">
              {item.qty}×
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">{item.product_name}</span>
              <span className="text-xs text-muted-foreground">{formatCurrency(item.unit_price_cents)} cada</span>
            </span>
            <span className="font-semibold text-foreground tabular-nums">{formatCurrency(item.subtotal_cents)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function OrderPaymentSection({ order }: { order: OrderDetail }) {
  const latestPayment = order.payments[0] ?? null;
  const isCash = isCashPaymentMethod(latestPayment?.payment_method);
  const isDoor = isOfflinePaymentMethod(latestPayment?.payment_method);
  // Regra de vasilhame: antes da entrega, o valor pode subir até o teto se faltar vazio.
  const bottleRulePending = order.max_bottle_charge_cents > 0 && order.bottle_step_recorded_at == null;

  return (
    <SectionCard title="Pagamento">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatCurrency(order.subtotal_cents)}</dd>
        </div>
        {order.bottles_sold > 0 && order.total_cents > order.subtotal_cents ? (
          <div className="flex justify-between text-muted-foreground">
            <dt>Vasilhames cobrados na entrega ({order.bottles_sold})</dt>
            <dd className="tabular-nums">{formatCurrency(order.total_cents - order.subtotal_cents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-hairline pt-1.5 font-semibold text-foreground">
          <dt>Total</dt>
          <dd className="text-primary tabular-nums">{formatCurrency(order.total_cents)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-low p-3 text-sm">
        {isDoor && !isCash ? <CreditCard className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <Banknote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
        <p>
          <span className="font-semibold text-foreground">
            {isDoor ? (isCash ? "Dinheiro na entrega" : "Cartão na entrega") : "Pago no app"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {isDoor
              ? !isCash
                ? "O motorista cobra na maquininha."
                : latestPayment?.cash_change_for_cents == null
                  ? "Valor exato."
                  : `Troco para ${formatCurrency(latestPayment.cash_change_for_cents)}.`
              : latestPayment?.status === "CAPTURED"
                ? "Pagamento confirmado pelo Mercado Pago."
                : "Aguardando confirmação do Mercado Pago."}
          </span>
        </p>
      </div>

      {bottleRulePending ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-sky/10 p-3 text-xs text-foreground">
          <Recycle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          Exige {plural(order.bottles_full_ordered, "vasilhame vazio", "vasilhames vazios")} na entrega. Sem eles: + até{" "}
          {formatCurrency(order.max_bottle_charge_cents)} ou entrega parcial.
        </p>
      ) : null}
      {order.bottles_loaned > 0 ? <p className="mt-2 text-xs text-muted-foreground">Em caução: {order.bottles_loaned}</p> : null}
    </SectionCard>
  );
}

export function OrderSubscriptionSection({ order }: { order: OrderDetail }) {
  if (!isFromSubscription(order)) return null;
  const progress = formatSubscriptionProgress(order);
  const completed = order.completed_deliveries ?? 0;
  const remaining = order.remaining_after_current ?? order.remaining_deliveries ?? 0;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Repeat2 className="size-4 text-primary" aria-hidden /> Assinatura · {order.subscription_plan_name ?? "Plano"}
        </span>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-surface-low p-2">
          <dt className="text-[11px] text-muted-foreground">Esta entrega</dt>
          <dd className="font-heading font-bold text-ink">{progress ?? "—"}</dd>
        </div>
        <div className="rounded-xl bg-surface-low p-2">
          <dt className="text-[11px] text-muted-foreground">Feitas</dt>
          <dd className="font-heading font-bold text-ink">{completed}</dd>
        </div>
        <div className="rounded-xl bg-surface-low p-2">
          <dt className="text-[11px] text-muted-foreground">Restam</dt>
          <dd className="font-heading font-bold text-ink">{remaining}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Quantidade desta entrega: {order.quantity_for_this_delivery ?? "—"} · Assinatura {formatSubscriptionStatus(order.subscription_status).toLowerCase()}
      </p>
    </SectionCard>
  );
}

export function OrderTimelineSection({ order }: { order: OrderDetail }) {
  if (order.events.length === 0) return null;
  return (
    <SectionCard title="Histórico">
      <ol className="space-y-3">
        {order.events.map((event, index) => {
          const actor = actorTypeLabel(event.actor_type);
          return (
            <li key={`${event.status}-${event.timestamp}-${index}`} className="flex gap-2.5">
              <span className="flex flex-col items-center">
                <span className="mt-1.5 size-2 rounded-full bg-primary" />
                {index < order.events.length - 1 ? <span className="mt-1 w-px flex-1 bg-surface-high" /> : null}
              </span>
              <span className="pb-1">
                <span className="block text-sm font-medium text-foreground">{formatEventLabel(event.status, event.payload)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.timestamp)} às {formatTime(event.timestamp)}
                  {actor ? ` · ${actor}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
