"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusPill } from "@/src/components/shared/status-pill";
import { DeliveryWindow } from "@/src/types/enums";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { Order } from "@/src/types";

interface OrderDetail extends Order {
  items: { product_name: string; qty: number; unit_price_cents: number }[];
  events: TimelineEvent[];
  consumer_name: string;
  address_line: string;
}

export default function DistributorOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((data) => setOrder(data.order ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAction(action: string, body?: Record<string, unknown>) {
    setActionLoading(true);
    try {
      await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      router.refresh();
      const res = await fetch(`/api/orders/${id}`);
      const data = await res.json();
      setOrder(data.order ?? null);
    } catch {
      // handle silently
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i} className="animate-pulse"><CardContent className="py-4"><div className="h-4 w-40 rounded bg-muted" /></CardContent></Card>)}</div>;
  if (!order) return <p className="text-destructive">Pedido não encontrado.</p>;

  const canAccept = order.status === "SENT_TO_DISTRIBUTOR";
  const canReject = order.status === "SENT_TO_DISTRIBUTOR";
  const canProceedToChecklist = order.status === "ACCEPTED_BY_DISTRIBUTOR";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Pedido #{order.id}</h1>
        <StatusPill status={order.status} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Cliente</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>{order.consumer_name}</p>
          <p className="text-muted-foreground">{order.address_line}</p>
          <p className="text-muted-foreground">
            {formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
          </p>
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

      <div className="flex gap-2">
        {canAccept && (
          <Button
            className="flex-1"
            disabled={actionLoading}
            onClick={() => handleAction("accept")}
          >
            Aceitar
          </Button>
        )}
        {canReject && (
          <div className="flex-1 space-y-2">
            <Input
              placeholder="Motivo da recusa"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Button
              variant="destructive"
              className="w-full"
              disabled={actionLoading || !rejectReason}
              onClick={() => handleAction("reject", { reason: rejectReason })}
            >
              Recusar
            </Button>
          </div>
        )}
        {canProceedToChecklist && (
          <Button
            className="flex-1"
            onClick={() => router.push(`/distributor/orders/${id}/checklist`)}
          >
            Ir para Checklist
          </Button>
        )}
      </div>
    </div>
  );
}
