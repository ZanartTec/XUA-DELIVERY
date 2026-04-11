"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useIsClient } from "@/src/hooks/use-is-client";
import { StatusPill } from "@/src/components/shared/status-pill";
import { DeliveryWindow } from "@/src/types/enums";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import type { Order, AuditEvent } from "@/src/types";

interface SupportOrderDetail extends Order {
  items: { product_name: string; qty: number; unit_price_cents: number }[];
  events: TimelineEvent[];
  consumer_name: string;
  consumer_email: string;
  consumer_phone: string;
  address_line: string;
  audit_events: AuditEvent[];
}

export default function SupportOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isClient = useIsClient();
  const [order, setOrder] = useState<SupportOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${id}?scope=support`)
      .then((r) => r.json())
      .then((data) => setOrder(data.order ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm"><div className="h-4 w-40 rounded-lg bg-[#e1e3e4]" /></div>)}</div>;
  if (!order) return <p className="text-destructive">Pedido não encontrado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading text-foreground">Pedido #{order.id}</h1>
        <StatusPill status={order.status} />
      </div>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-1.5">
        <p className="text-sm font-semibold font-heading">Consumidor</p>
        <div className="text-sm space-y-1">
          <p><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome:</span> {order.consumer_name}</p>
          <p><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail:</span> {order.consumer_email}</p>
          <p><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefone:</span> {order.consumer_phone}</p>
          <p><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço:</span> {order.address_line}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
        <p className="text-sm font-semibold font-heading">Itens</p>
        <div className="space-y-2 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.product_name} x{item.qty}</span>
              <span className="font-medium text-primary">{formatCurrency(item.unit_price_cents * item.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold pt-2" style={{ borderTop: "1px solid #e1e3e4" }}>
            <span>Total</span>
            <span className="text-primary">{formatCurrency(order.total_cents)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
          </p>
        </div>
      </div>

      {order.events.length > 0 && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
          <p className="text-sm font-semibold font-heading">Timeline</p>
          <OrderTimeline events={order.events} />
        </div>
      )}

      {order.audit_events.length > 0 && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-2">
          <p className="text-sm font-semibold font-heading">Audit Trail</p>
          <div className="space-y-2 text-xs">
            {order.audit_events.map((evt) => (
              <div key={evt.id} className="rounded-xl bg-[#e1e3e4]/50 p-2.5">
                <div className="flex justify-between">
                  <span className="font-semibold">{evt.event_type}</span>
                  <span className="text-muted-foreground/60">
                    {isClient ? new Date(evt.occurred_at).toLocaleString("pt-BR") : ""}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {evt.actor_type}:{evt.actor_id} — {evt.source_app}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
