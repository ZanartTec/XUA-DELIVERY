"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { DeliveryWindow, OrderStatus } from "@/src/types/enums";
import { StatusPill } from "@/src/components/shared/status-pill";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  ArrowLeft,
  Check,
  Truck,
  Home,
  Droplets,
  MapPin,
  Calendar,
  Clock,
} from "lucide-react";
import type { Order } from "@/src/types";

interface OrderDetail extends Order {
  items: { product_name: string; qty: number; unit_price_cents: number }[];
  events: TimelineEvent[];
  otp_code?: string;
}

/* ── helpers ── */
function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function getProgress(status: string) {
  const s = status as OrderStatus;
  if (s === OrderStatus.DELIVERED) return { step: 3, pct: "w-full" };
  if (
    s === OrderStatus.OUT_FOR_DELIVERY ||
    s === OrderStatus.ACCEPTED_BY_DISTRIBUTOR ||
    s === OrderStatus.SENT_TO_DISTRIBUTOR
  )
    return { step: 2, pct: "w-2/3" };
  return { step: 1, pct: "w-1/3" };
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
    return (
      <div className="px-6 pt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]"
          >
            <div className="p-6 space-y-3">
              <div className="h-5 w-40 rounded-lg bg-[#e1e3e4]" />
              <div className="h-3 w-56 rounded-lg bg-[#e1e3e4]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <Droplets className="h-10 w-10 text-red-400" />
        </div>
        <p className="text-[#737688]">Pedido não encontrado.</p>
        <Button
          variant="ghost"
          className="mt-4 text-[#0041c8]"
          onClick={() => router.push("/orders")}
        >
          Voltar aos pedidos
        </Button>
      </div>
    );
  }

  const isDelivered = order.status === "DELIVERED";
  const { step, pct } = getProgress(order.status);

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="px-6 pt-4 pb-2 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-[#f3f4f5] flex items-center justify-center hover:bg-[#e1e3e4] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-[#191c1d]" />
        </button>
        <div className="flex-1">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#0041c8]">
            Detalhes do Pedido
          </p>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-[#191c1d]">
            #{shortId(order.id)}
          </h1>
        </div>
        <StatusPill status={order.status} />
      </div>

      {/* ── Active order card with progress ── */}
      <div className="mx-6 mt-4 bg-[#f3f4f5] rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#0041c8]/5 rounded-full -mr-20 -mt-20 blur-3xl" />

        <div className="relative z-10">
          {/* Product summary */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <Droplets className="h-7 w-7 text-[#0041c8]" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-lg font-bold text-[#191c1d]">
                {order.items.length === 1
                  ? order.items[0].product_name
                  : `${order.items.length} produtos`}
              </h3>
              <p className="text-sm text-[#737688] font-medium">
                Pedido #{shortId(order.id)} •{" "}
                <span className="text-[#0041c8]">
                  {formatCurrency(order.total_cents)}
                </span>
              </p>
            </div>
          </div>

          {/* Progress tracker */}
          <div className="relative mt-6 pb-2">
            <div className="absolute top-3.5 left-0 w-full h-1 bg-[#e1e3e4] rounded-full">
              <div
                className={`h-full bg-linear-to-r from-[#0041c8] to-[#0055ff] rounded-full transition-all ${pct}`}
              />
            </div>
            <div className="relative flex justify-between">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#f3f4f5]/80 ${
                    step >= 1
                      ? "bg-linear-to-br from-[#0041c8] to-[#0055ff] text-white"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    step >= 1 ? "text-[#0041c8]" : "text-[#737688]"
                  }`}
                >
                  Confirmado
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#f3f4f5]/80 ${
                    step >= 2
                      ? "bg-linear-to-br from-[#0041c8] to-[#0055ff] text-white"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  <Truck className="h-3.5 w-3.5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    step >= 2 ? "text-[#0041c8]" : "text-[#737688]"
                  }`}
                >
                  A caminho
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#f3f4f5]/80 ${
                    step >= 3
                      ? "bg-linear-to-br from-[#0041c8] to-[#0055ff] text-white"
                      : "bg-[#e1e3e4] text-[#737688]"
                  }`}
                >
                  <Home className="h-3.5 w-3.5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    step >= 3 ? "text-[#0041c8]" : "text-[#737688]"
                  }`}
                >
                  Entregue
                </span>
              </div>
            </div>
          </div>

          {/* OTP code */}
          {order.otp_code && (
            <div className="mt-6 pt-5 border-t border-[#e1e3e4]/40 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#dce1ff] flex items-center justify-center">
                <Check className="h-5 w-5 text-[#0041c8]" />
              </div>
              <div>
                <p className="text-xs font-medium text-[#737688]">Código de entrega</p>
                <p className="font-mono text-lg font-bold tracking-widest text-[#0041c8]">
                  {order.otp_code}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Delivery Info ── */}
      <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
          Informações da entrega
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-[#0041c8]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#191c1d]">
                {formatDate(order.delivery_date)}
              </p>
              <p className="text-xs text-[#737688]">Data da entrega</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Clock className="h-4 w-4 text-[#0041c8]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#191c1d]">
                {order.delivery_window === DeliveryWindow.MORNING
                  ? "Manhã (08:00–12:00)"
                  : "Tarde (13:00–18:00)"}
              </p>
              <p className="text-xs text-[#737688]">Janela de entrega</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Items ── */}
      <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
          Itens do Pedido
        </h3>
        <div className="space-y-3 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#f3f4f5] flex items-center justify-center">
                  <Droplets className="h-4 w-4 text-[#0041c8]" />
                </div>
                <div>
                  <p className="font-semibold text-[#191c1d]">{item.product_name}</p>
                  <p className="text-xs text-[#737688]">Qtd: {item.qty}</p>
                </div>
              </div>
              <span className="font-heading font-bold text-[#191c1d]">
                {formatCurrency(item.unit_price_cents * item.qty)}
              </span>
            </div>
          ))}

          <div className="pt-3 mt-3 border-t border-[#e1e3e4] space-y-1.5">
            <div className="flex justify-between text-[#737688]">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-[#737688]">
              <span>Taxa de entrega</span>
              <span>{formatCurrency(order.delivery_fee_cents)}</span>
            </div>
            {order.deposit_cents > 0 && (
              <div className="flex justify-between text-[#737688]">
                <span>Caução</span>
                <span>{formatCurrency(order.deposit_cents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[#191c1d] pt-1.5 border-t border-[#e1e3e4]">
              <span>Total</span>
              <span className="text-[#0041c8]">
                {formatCurrency(order.total_cents)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      {order.events.length > 0 && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Timeline
          </h3>
          <OrderTimeline events={order.events} />
        </div>
      )}

      {/* ── NPS Rating ── */}
      {isDelivered && !npsSubmitted && (
        <div className="mx-6 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-[#737688] mb-4">
            Avalie sua entrega
          </h3>
          <div className="space-y-3">
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((score) => (
                <button
                  key={score}
                  onClick={() => !npsSubmitting && setNps(score)}
                  disabled={npsSubmitting}
                  className={`h-11 w-11 rounded-full text-sm font-bold transition-all active:scale-95 ${
                    nps === score
                      ? "bg-linear-to-br from-[#0041c8] to-[#0055ff] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]"
                      : "bg-[#f3f4f5] text-[#737688] hover:bg-[#e1e3e4]"
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
              className="rounded-xl border-0 bg-[#f3f4f5]"
            />
            <Button
              className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-bold shadow-lg hover:opacity-90 active:scale-[0.98]"
              onClick={submitNps}
              disabled={nps === null || npsSubmitting}
            >
              {npsSubmitting ? "Enviando..." : "Enviar avaliação"}
            </Button>
          </div>
        </div>
      )}

      {npsSubmitted && (
        <p
          className={`mx-6 mt-4 text-center text-sm font-medium ${
            nps !== null && nps <= 2 ? "text-red-500" : "text-green-600"
          }`}
        >
          {npsMessage}
        </p>
      )}
    </div>
  );
}
