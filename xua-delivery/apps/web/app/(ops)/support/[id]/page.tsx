"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StatusPill } from "@/src/components/shared/status-pill";
import { DeliveryWindow } from "@/src/types/enums";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
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
  const [order, setOrder] = useState<SupportOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${id}?scope=support`)
      .then((r) => r.json())
      .then((data) => setOrder(data.order ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i} className="animate-pulse"><CardContent className="py-4"><div className="h-4 w-40 rounded bg-muted" /></CardContent></Card>)}</div>;
  if (!order) return <p className="text-destructive">Pedido não encontrado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Pedido #{order.id}</h1>
        <StatusPill status={order.status} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Consumidor</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="font-medium">Nome:</span> {order.consumer_name}</p>
          <p><span className="font-medium">E-mail:</span> {order.consumer_email}</p>
          <p><span className="font-medium">Telefone:</span> {order.consumer_phone}</p>
          <p><span className="font-medium">Endereço:</span> {order.address_line}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Itens</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.product_name} x{item.qty}</span>
              <span>{formatCurrency(item.unit_price_cents * item.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>Total</span>
            <span>{formatCurrency(order.total_cents)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
          </p>
        </CardContent>
      </Card>

      {order.events.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
          <CardContent>
            <OrderTimeline events={order.events} />
          </CardContent>
        </Card>
      )}

      {order.audit_events.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Audit Trail</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              {order.audit_events.map((evt) => (
                <div key={evt.id} className="border rounded p-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{evt.event_type}</span>
                    <span className="text-muted-foreground/60">
                      {new Date(evt.occurred_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {evt.actor_type}:{evt.actor_id} — {evt.source_app}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
