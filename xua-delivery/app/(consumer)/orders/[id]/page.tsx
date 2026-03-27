"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { DeliveryWindow } from "@/src/types/enums";
import { StatusPill } from "@/src/components/shared/status-pill";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { Order } from "@/src/types";

interface OrderDetail extends Order {
  items: { product_name: string; qty: number; unit_price_cents: number }[];
  events: TimelineEvent[];
  otp_code?: string;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nps, setNps] = useState<number | null>(null);
  const [npsComment, setNpsComment] = useState("");
  const [npsSubmitted, setNpsSubmitted] = useState(false);
  const [npsSubmitting, setNpsSubmitting] = useState(false);
  const [npsMessage, setNpsMessage] = useState("");

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((data) => setOrder(data.order ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function submitNps() {
    if (nps === null || npsSubmitting) return;
    setNpsSubmitting(true);
    const payload: { rating: number; comment?: string } = { rating: nps };
    if (npsComment.trim()) payload.comment = npsComment.trim();
    await fetch(`/api/orders/${id}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setNpsMessage(
      nps <= 2
        ? "Sentimos muito! Abrimos um chamado de suporte."
        : "Obrigado pela avaliação!"
    );
    setNpsSubmitted(true);
    setNpsSubmitting(false);
  }

  if (loading) {
    return <div className="p-4 text-muted-foreground">Carregando...</div>;
  }

  if (!order) {
    return <div className="p-4 text-destructive">Pedido não encontrado.</div>;
  }

  const isDelivered = order.status === "DELIVERED";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Pedido #{order.id}</h1>
        <StatusPill status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Itens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {item.product_name} x{item.qty}
              </span>
              <span>{formatCurrency(item.unit_price_cents * item.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>Total</span>
            <span>{formatCurrency(order.total_cents)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Entrega</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>{formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}</p>
          {order.otp_code && (
            <p className="font-mono text-lg tracking-widest text-center py-2">
              {order.otp_code}
            </p>
          )}
        </CardContent>
      </Card>

      {order.events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTimeline events={order.events} />
          </CardContent>
        </Card>
      )}

      {isDelivered && !npsSubmitted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Avalie sua entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1 justify-center">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((score) => (
                <button
                  key={score}
                  onClick={() => !npsSubmitting && setNps(score)}
                  disabled={npsSubmitting}
                  className={`w-10 h-10 rounded-full border text-sm font-medium transition-colors ${
                    nps === score
                      ? "bg-accent text-white border-accent"
                      : "border-border text-muted-foreground hover:bg-muted"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {score}
                </button>
              ))}
            </div>
            <Input
              placeholder="Comentário (opcional)"
              value={npsComment}
              onChange={(e) => setNpsComment(e.target.value)}
              disabled={npsSubmitting}
            />
            <Button className="w-full" onClick={submitNps} disabled={nps === null || npsSubmitting}>
              {npsSubmitting ? "Enviando..." : "Enviar avaliação"}
            </Button>
          </CardContent>
        </Card>
      )}

      {npsSubmitted && (
        <p className={`text-sm text-center ${
          nps !== null && nps <= 2 ? "text-destructive" : "text-green-600"
        }`}>{npsMessage}</p>
      )}
    </div>
  );
}
