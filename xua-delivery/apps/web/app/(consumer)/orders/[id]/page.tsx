"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { DeliveryWindow } from "@/src/types/enums";
import { StatusPill } from "@/src/components/shared/status-pill";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
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
    return <div className="px-4 pt-4 text-muted-foreground">Carregando...</div>;
  }

  if (!order) {
    return <div className="px-4 pt-4 text-destructive">Pedido não encontrado.</div>;
  }

  const isDelivered = order.status === "DELIVERED";

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-4 pt-4">
        <h1 className="text-lg font-bold font-heading">Pedido #{order.id}</h1>
        <StatusPill status={order.status} />
      </div>

      {/* Itens */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Itens</p>
        <div className="space-y-2 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.product_name} x{item.qty}</span>
              <span>{formatCurrency(item.unit_price_cents * item.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 font-bold" style={{ borderTop: "1px solid #e1e3e4" }}>
            <span>Total</span>
            <span className="text-[#0041c8]">{formatCurrency(order.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Entrega */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-2 text-sm font-semibold font-heading">Entrega</p>
        <div className="space-y-1 text-sm">
          <p>{formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}</p>
          {order.otp_code && (
            <p className="py-2 text-center font-mono text-lg tracking-widest">
              {order.otp_code}
            </p>
          )}
        </div>
      </div>

      {/* Timeline */}
      {order.events.length > 0 && (
        <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="mb-3 text-sm font-semibold font-heading">Timeline</p>
          <OrderTimeline events={order.events} />
        </div>
      )}

      {/* NPS */}
      {isDelivered && !npsSubmitted && (
        <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="mb-3 text-sm font-semibold font-heading">Avalie sua entrega</p>
          <div className="space-y-3">
            <div className="flex justify-center gap-1">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((score) => (
                <button
                  key={score}
                  onClick={() => !npsSubmitting && setNps(score)}
                  disabled={npsSubmitting}
                  className={`h-10 w-10 rounded-full text-sm font-medium transition-all active:scale-95 ${
                    nps === score
                      ? "bg-[#0041c8] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]"
                      : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
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
              className="rounded-xl border-0 bg-[#e1e3e4]"
            />
            <Button
              className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
              onClick={submitNps}
              disabled={nps === null || npsSubmitting}
            >
              {npsSubmitting ? "Enviando..." : "Enviar avaliação"}
            </Button>
          </div>
        </div>
      )}

      {npsSubmitted && (
        <p className={`text-center text-sm ${
          nps !== null && nps <= 2 ? "text-destructive" : "text-green-600"
        }`}>{npsMessage}</p>
      )}
    </div>
  );
}
