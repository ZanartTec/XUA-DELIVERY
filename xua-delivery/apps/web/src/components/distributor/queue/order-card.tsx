"use client";

import Link from "next/link";
import { Check, Clock3, MapPin, PackageCheck, Repeat2, Truck, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cardVariants } from "@/src/components/ui/card";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { DeliveryUrgencyBadge } from "@/src/components/shared/distributor/delivery-urgency-badge";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { useDeliveryUrgency } from "@/src/hooks/distributor/use-delivery-urgency";
import { formatScheduledTime, formatShortOrderId, isFromSubscription } from "@/src/lib/order-detail-format";
import { cn, formatCurrency, formatDateShort, formatRelativeShort } from "@/src/lib/utils";
import { isIncoming, isInPreparation, shortAddress, type QueueOrder } from "./queue-model";
import { Spinner } from "@/src/components/ui/spinner";
import { Badge } from "@/src/components/ui/badge";

const URGENCY_STRIPE: Record<string, string> = {
  overdue: "bg-destructive",
  urgent: "bg-warning",
  soon: "bg-warning/60",
};

export interface OrderActions {
  loading: boolean;
  onOpen: (order: QueueOrder) => void;
  onAccept: (order: QueueOrder) => void;
  onReject: (order: QueueOrder) => void;
}

/** Prazo de resposta de um pedido novo. */
export function SlaPill({ order }: { order: QueueOrder }) {
  return (
    <Badge variant="secondary" className="h-auto bg-warning-surface py-0.5 font-semibold text-warning-foreground">
      <Clock3 aria-hidden />
      <SlaCountdown
        deadlineIso={order.sla_deadline}
        prefix="Responder em"
        expiredLabel="Prazo de resposta vencido"
        className="font-sans text-xs font-semibold text-inherit"
      />
    </Badge>
  );
}

export function SubscriptionChip() {
  return (
    <Badge variant="secondary" className="text-primary">
      <Repeat2 aria-hidden /> Assinatura
    </Badge>
  );
}

/** Aceitar / recusar (pedido novo) ou separar e despachar (em preparo). `compact` = botões de desktop. */
export function OrderActionButtons({
  order,
  loading,
  onAccept,
  onReject,
  compact,
}: Pick<OrderActions, "loading" | "onAccept" | "onReject"> & { order: QueueOrder; compact?: boolean }) {
  const size = compact ? "lg" : "xl";
  if (isIncoming(order)) {
    return (
      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-[auto_1fr]")}>
        <Button variant="outline" size={size} className={compact ? undefined : "px-4"} disabled={loading} onClick={() => onReject(order)}>
          <X aria-hidden /> Recusar
        </Button>
        <Button variant="cta" size={size} disabled={loading} onClick={() => onAccept(order)}>
          {loading ? <Spinner aria-hidden /> : <Check aria-hidden />} Aceitar
        </Button>
      </div>
    );
  }
  if (isInPreparation(order)) {
    return (
      <Button asChild variant="soft" size={size} className="w-full">
        <Link href={`/distributor/orders/${order.id}/checklist`}>
          <PackageCheck aria-hidden /> Separar e despachar
        </Link>
      </Button>
    );
  }
  return null;
}

interface OrderCardProps extends OrderActions {
  order: QueueOrder;
  /** Versão do quadro (desktop): paddings e botões menores. */
  compact?: boolean;
}

/** Cartão do pedido: informação no meio, ação da etapa na base. */
export function OrderCard({ order, compact = false, loading, onOpen, onAccept, onReject }: OrderCardProps) {
  const urgency = useDeliveryUrgency(order);
  const incoming = isIncoming(order);
  const hasActions = incoming || isInPreparation(order);

  return (
    <article className={cardVariants({ className: "relative overflow-hidden" })}>
      {URGENCY_STRIPE[urgency.level] ? (
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", URGENCY_STRIPE[urgency.level])} />
      ) : null}
      <button
        type="button"
        onClick={() => onOpen(order)}
        className={cn("block w-full text-left hover:bg-muted/40", compact ? "space-y-1.5 p-3 pl-4" : "space-y-2 p-4 pl-5")}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono font-semibold whitespace-nowrap text-foreground">#{formatShortOrderId(order.id)}</span>
          <span className="whitespace-nowrap">· {formatRelativeShort(order.created_at)}</span>
          {isFromSubscription(order) ? <SubscriptionChip /> : null}
          <DeliveryUrgencyBadge urgency={urgency} className="ml-auto" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-semibold text-foreground">{order.consumer_name}</p>
          <p className="shrink-0 font-heading font-bold text-ink tabular-nums">{formatCurrency(order.total_cents)}</p>
        </div>
        <p className="line-clamp-1 text-sm text-foreground">{order.item_summary}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{shortAddress(order.address_summary)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden /> {formatDateShort(order.delivery_date)} · {formatScheduledTime(order)}
          </span>
          {!incoming ? (
            <span
              className={cn(
                "flex items-center gap-1",
                !order.driver_name && isInPreparation(order) && "font-medium text-warning-foreground",
              )}
            >
              <Truck className="size-3.5" aria-hidden /> {order.driver_name ?? "Sem motorista"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} audience="ops" />
          {incoming ? <SlaPill order={order} /> : null}
        </div>
      </button>

      {hasActions ? (
        <div className="border-t border-hairline p-2">
          <OrderActionButtons order={order} loading={loading} onAccept={onAccept} onReject={onReject} compact={compact} />
        </div>
      ) : null}
    </article>
  );
}
