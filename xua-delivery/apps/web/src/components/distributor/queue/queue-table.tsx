"use client";

import Link from "next/link";
import { Check, ChevronRight, PackageCheck, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cardVariants } from "@/src/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { DeliveryUrgencyBadge } from "@/src/components/shared/distributor/delivery-urgency-badge";
import { useDeliveryUrgency } from "@/src/hooks/distributor/use-delivery-urgency";
import { formatScheduledTime, formatShortOrderId, isFromSubscription } from "@/src/lib/order-detail-format";
import { cn, formatCurrency, formatDateShort, formatRelativeShort } from "@/src/lib/utils";
import { SlaPill, SubscriptionChip, type OrderActions } from "./order-card";
import { isIncoming, isInPreparation, isRedelivery, shortAddress, type QueueOrder } from "./queue-model";
import { Spinner } from "@/src/components/ui/spinner";

function DeliveryCell({ order }: { order: QueueOrder }) {
  const urgency = useDeliveryUrgency(order);
  return (
    <div className="space-y-0.5">
      <p className="tabular-nums">
        {formatDateShort(order.delivery_date)} · {formatScheduledTime(order)}
      </p>
      <DeliveryUrgencyBadge urgency={urgency} />
    </div>
  );
}

/** Motorista do pedido; destaca "Sem motorista" quando já está em preparo. */
function DriverText({ order, className }: { order: QueueOrder; className?: string }) {
  if (isIncoming(order)) return <span className={cn("text-muted-foreground", className)}>—</span>;
  if (order.driver_name) return <span className={className}>{order.driver_name}</span>;
  return (
    <span className={cn(isInPreparation(order) ? "font-medium text-warning-foreground" : "text-muted-foreground", className)}>
      Sem motorista
    </span>
  );
}

function RowActions({ order, loading, onAccept, onReject, onOpen }: OrderActions & { order: QueueOrder }) {
  // Os botões não podem abrir o painel da linha: o clique da linha é só do que não é botão.
  const stop = (event: React.MouseEvent) => event.stopPropagation();

  if (isIncoming(order)) {
    return (
      <div className="flex items-center justify-end gap-2" onClick={stop}>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => onReject(order)}>
          <X aria-hidden /> Recusar
        </Button>
        <Button variant="cta" size="sm" disabled={loading} onClick={() => onAccept(order)}>
          {loading ? <Spinner aria-hidden /> : <Check aria-hidden />} Aceitar
        </Button>
      </div>
    );
  }
  if (isInPreparation(order)) {
    return (
      <div className="flex items-center justify-end gap-2" onClick={stop}>
        <Button asChild variant="soft" size="sm">
          <Link href={`/distributor/orders/${order.id}/checklist`}>
            <PackageCheck aria-hidden /> {isRedelivery(order) ? "Despachar reentrega" : "Separar e despachar"}
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="icon-sm" aria-label={`Abrir pedido #${formatShortOrderId(order.id)}`} onClick={() => onOpen(order)}>
        <ChevronRight />
      </Button>
    </div>
  );
}

interface QueueTableProps {
  orders: readonly QueueOrder[];
  actionLoadingId: string | null;
  onOpen: OrderActions["onOpen"];
  onAccept: OrderActions["onAccept"];
  onReject: OrderActions["onReject"];
  dimmed?: boolean;
}

/** Fila em tabela (desktop): uma linha por pedido, ações da etapa na própria linha. */
export function QueueTable({ orders, actionLoadingId, onOpen, onAccept, onReject, dimmed }: QueueTableProps) {
  return (
    <div className={cardVariants({ className: cn("overflow-hidden", dimmed && "opacity-80") })}>
      <Table aria-label="Pedidos">
        <TableHeader>
          <TableRow className="bg-surface-low hover:bg-surface-low">
            <TableHead>Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="hidden 2xl:table-cell">Itens</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead className="hidden 2xl:table-cell">Motorista</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Total</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const incoming = isIncoming(order);
            return (
              <TableRow key={order.id} onClick={() => onOpen(order)} className="cursor-pointer">
                <TableCell>
                  <Button
                    variant="link"
                    className="h-auto flex-col items-start gap-0 p-0 text-foreground no-underline hover:no-underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(order);
                    }}
                  >
                    <span className="font-mono text-[13px] font-semibold">#{formatShortOrderId(order.id)}</span>
                    <span className="text-xs font-normal text-muted-foreground">{formatRelativeShort(order.created_at)}</span>
                  </Button>
                  {isFromSubscription(order) ? (
                    <span className="mt-1 inline-block">
                      <SubscriptionChip />
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-56">
                  <p className="truncate font-medium text-foreground">{order.consumer_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{shortAddress(order.address_summary)}</p>
                  <p className="truncate text-xs text-foreground 2xl:hidden">{order.item_summary}</p>
                </TableCell>
                <TableCell className="hidden max-w-56 truncate text-muted-foreground 2xl:table-cell">{order.item_summary}</TableCell>
                <TableCell>
                  <DeliveryCell order={order} />
                </TableCell>
                <TableCell className="hidden 2xl:table-cell">
                  <DriverText order={order} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={order.status} audience="ops" />
                    {incoming ? <SlaPill order={order} /> : <DriverText order={order} className="text-xs 2xl:hidden" />}
                  </div>
                </TableCell>
                <TableCell className="hidden text-right font-semibold tabular-nums lg:table-cell">{formatCurrency(order.total_cents)}</TableCell>
                <TableCell>
                  <RowActions
                    order={order}
                    loading={actionLoadingId === order.id}
                    onOpen={onOpen}
                    onAccept={onAccept}
                    onReject={onReject}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
