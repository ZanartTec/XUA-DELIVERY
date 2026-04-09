"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusPill } from "@/src/components/shared/status-pill";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { DeliveryWindow } from "@/src/types/enums";
import { OrderTimeline, type TimelineEvent } from "@/src/components/shared/order-timeline";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import type { Order } from "@/src/types";

interface OrderDetail extends Order {
  items: { product_name: string; qty: number; unit_price_cents: number }[];
  events: TimelineEvent[];
  consumer_name: string;
  address_line: string;
  consumer_email?: string | null;
  consumer_phone?: string | null;
  sla_deadline?: string | null;
}

const REJECT_REASON_OPTIONS = [
  { value: "out_of_stock", label: "Falta de estoque" },
  { value: "delivery_area_issue", label: "Endereço fora da operação" },
  { value: "operational_capacity", label: "Capacidade operacional esgotada" },
  { value: "other", label: "Outro motivo" },
] as const;

export default function DistributorOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState<(typeof REJECT_REASON_OPTIONS)[number]["value"] | "">("");
  const [rejectDetails, setRejectDetails] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrder() {
      try {
        const response = await fetch(`/api/orders/${id}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? `Erro ${response.status}`);
        }
        setOrder(data.order ?? null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Erro ao carregar pedido");
      } finally {
        setLoading(false);
      }
    }

    void loadOrder();
  }, [id]);

  async function handleAction(action: string, body?: Record<string, unknown>) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      // Após aceite, redireciona direto para o checklist
      if (action === "accept") {
        router.push(`/distributor/orders/${id}/checklist`);
        return;
      }
      if (action === "reject") {
        router.push("/distributor/queue");
        return;
      }
      router.refresh();
      const detailRes = await fetch(`/api/orders/${id}`);
      const data = await detailRes.json();
      setOrder(data.order ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)]"><div className="h-4 w-40 rounded-lg bg-[#e1e3e4]" /></div>)}</div>;
  if (!order) return <p className="text-destructive">Pedido não encontrado.</p>;

  const canAccept = order.status === "SENT_TO_DISTRIBUTOR";
  const canReject = order.status === "SENT_TO_DISTRIBUTOR";
  const canProceedToChecklist = order.status === "ACCEPTED_BY_DISTRIBUTOR";
  const rejectNeedsDetails = rejectReason === "other";
  const rejectReady = rejectReason !== "" && (!rejectNeedsDetails || rejectDetails.trim().length >= 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading">Pedido #{order.id}</h1>
        <StatusPill status={order.status} />
      </div>

      {order.sla_deadline && (
        <div className="rounded-2xl border border-[#d7e3ff] bg-[#edf4ff] px-4 py-3 text-sm text-[#0b2a59] shadow-[0_2px_12px_rgba(0,26,64,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold font-heading">SLA para aceite</span>
            <SlaCountdown deadlineIso={order.sla_deadline} className="text-base" />
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-2 text-sm font-semibold font-heading">Cliente</p>
        <div className="text-sm space-y-1">
          <p>{order.consumer_name}</p>
          <p className="text-muted-foreground">{order.address_line}</p>
          {order.consumer_phone && <p className="text-muted-foreground">Telefone: {order.consumer_phone}</p>}
          {order.consumer_email && <p className="text-muted-foreground">E-mail: {order.consumer_email}</p>}
          <p className="text-muted-foreground">
            {formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-2 text-sm font-semibold font-heading">Itens</p>
        <div className="space-y-2 text-sm">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.product_name} x{item.qty}</span>
              <span>{formatCurrency(item.unit_price_cents * item.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold pt-2" style={{ borderTop: "1px solid #e1e3e4" }}>
            <span>Total</span>
            <span className="text-[#0041c8]">{formatCurrency(order.total_cents)}</span>
          </div>
        </div>
      </div>

      {order.events.length > 0 && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="mb-2 text-sm font-semibold font-heading">Timeline</p>
          <OrderTimeline events={order.events} />
        </div>
      )}

      {actionError && (
        <p className="text-sm text-red-600 rounded-xl bg-red-50 px-3 py-2">{actionError}</p>
      )}

      <div className="flex gap-2">
        {canAccept && (
          <Button
            className="flex-1 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
            disabled={actionLoading}
            onClick={() => handleAction("accept")}
          >
            Aceitar
          </Button>
        )}
        {canReject && (
          <div className="flex-1 space-y-2">
            <div className="grid gap-2">
              {REJECT_REASON_OPTIONS.map((option) => {
                const active = rejectReason === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRejectReason(option.value)}
                    className={[
                      "rounded-xl border px-3 py-2 text-left text-sm transition-all",
                      active
                        ? "border-[#0041c8] bg-[#edf4ff] text-[#0b2a59]"
                        : "border-[#e1e3e4] bg-white text-foreground hover:border-[#b9c8e8]",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {rejectNeedsDetails && (
              <Textarea
                placeholder="Descreva o motivo da recusa"
                value={rejectDetails}
                onChange={(e) => setRejectDetails(e.target.value)}
                className="min-h-24 rounded-xl border-[#d9dde3] bg-[#f5f6f7]"
              />
            )}
            <Button
              variant="destructive"
              className="w-full rounded-xl shadow-none"
              disabled={actionLoading || !rejectReady}
              onClick={() =>
                handleAction("reject", {
                  reason: rejectReason,
                  details: rejectNeedsDetails ? rejectDetails.trim() : undefined,
                })
              }
            >
              Recusar
            </Button>
          </div>
        )}
        {canProceedToChecklist && (
          <Button
            className="flex-1 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
            onClick={() => router.push(`/distributor/orders/${id}/checklist`)}
          >
            Ir para Checklist
          </Button>
        )}
      </div>
    </div>
  );
}
