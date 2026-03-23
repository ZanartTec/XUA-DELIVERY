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

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((data) => setOrder(data.order ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function submitNps() {
    if (nps === null) return;
    await fetch(`/api/orders/${id}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: nps, comment: npsComment }),
    });
    setNpsSubmitted(true);
  }

  if (loading) {
    return <div className="p-4 text-gray-500">Carregando...</div>;
  }

  if (!order) {
    return <div className="p-4 text-red-500">Pedido não encontrado.</div>;
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
                  onClick={() => setNps(score)}
                  className={`w-10 h-10 rounded-full border text-sm font-medium ${
                    nps === score
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <Input
              placeholder="Comentário (opcional)"
              value={npsComment}
              onChange={(e) => setNpsComment(e.target.value)}
            />
            <Button className="w-full" onClick={submitNps} disabled={nps === null}>
              Enviar avaliação
            </Button>
          </CardContent>
        </Card>
      )}

      {npsSubmitted && (
        <p className="text-sm text-green-600 text-center">Obrigado pela avaliação!</p>
      )}
    </div>
  );
}
