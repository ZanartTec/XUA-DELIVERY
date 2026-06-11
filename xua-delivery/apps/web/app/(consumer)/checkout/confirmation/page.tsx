"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { formatCurrency } from "@/src/lib/utils";
import { AlertCircle, Banknote, CheckCircle2, Clock3, CreditCard, ShoppingCart } from "lucide-react";
import { isCashPaymentMethod } from "@xua/shared/mappers/payment";

type PaymentViewStatus = "loading" | "approved" | "pending" | "failed" | "created" | "cash_pending";

interface PaymentStatusResponse {
  order: {
    id: string;
    status: string;
    payment_status: string | null;
    total_cents: number;
  };
  payment: {
    id: string;
    status: string;
    amount_cents: number;
    payment_method: string | null;
    cash_change_for_cents: number | null;
    provider: string | null;
    paid_at: string | null;
  } | null;
}

function getViewStatus(data: PaymentStatusResponse | null, fallback: string | null): PaymentViewStatus {
  if (!data) {
    if (fallback === "failure") return "failed";
    if (fallback === "pending") return "pending";
    return "loading";
  }

  if (isCashPaymentMethod(data.payment?.payment_method) && data.payment.status !== "CAPTURED") return "cash_pending";
  if (data.payment?.status === "CAPTURED" || data.order.payment_status === "paid") return "approved";
  if (data.payment?.status === "FAILED" || data.order.payment_status === "failed") return "failed";
  if (data.payment?.status === "REFUNDED" || data.order.payment_status === "refunded") return "failed";
  if (data.order.status === "PAYMENT_PENDING" || data.payment?.status === "CREATED") return "pending";
  return "created";
}

function isTerminalPaymentStatus(status: PaymentViewStatus): boolean {
  return status === "approved" || status === "failed" || status === "cash_pending";
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const paymentStatusParam = searchParams.get("paymentStatus");
  const [statusData, setStatusData] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState<string | null>(null);

  const viewStatus = useMemo(
    () => getViewStatus(statusData, paymentStatusParam),
    [statusData, paymentStatusParam]
  );

  useEffect(() => {
    if (!orderId) return;
    const oid = orderId;
    let cancelled = false;
    let attempts = 0;

    async function loadStatus() {
      try {
        const res = await fetch(`/api/payments/status/${encodeURIComponent(oid)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Erro ao buscar status");
        if (!cancelled) {
          setStatusData(body);
          setError(null);
          if (isTerminalPaymentStatus(getViewStatus(body, paymentStatusParam))) {
            window.clearInterval(interval);
          }
        }
      } catch {
        if (!cancelled) setError("Não foi possível atualizar o status do pagamento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const interval = window.setInterval(() => {
      attempts += 1;
      if (attempts > 30) {
        window.clearInterval(interval);
        return;
      }
      void loadStatus();
    }, 4000);
    void loadStatus();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [orderId, paymentStatusParam]);

  const Icon = viewStatus === "approved" ? CheckCircle2 : viewStatus === "failed" ? AlertCircle : viewStatus === "cash_pending" ? Banknote : Clock3;
  const iconClass = viewStatus === "approved" ? "text-green-600" : viewStatus === "failed" ? "text-red-600" : viewStatus === "cash_pending" ? "text-[#7a4700]" : "text-[#32466e]";
  const iconBg = viewStatus === "approved" ? "bg-green-100" : viewStatus === "failed" ? "bg-red-100" : viewStatus === "cash_pending" ? "bg-[#fff2dd]" : "bg-[#d8e2ff]";
  const title =
    viewStatus === "approved"
      ? "Pagamento aprovado!"
      : viewStatus === "failed"
        ? "Pagamento não aprovado"
        : viewStatus === "cash_pending"
          ? "Pedido confirmado!"
        : "Aguardando pagamento";
  const message =
    viewStatus === "approved"
      ? "Seu pedido foi confirmado e seguirá para a distribuidora."
      : viewStatus === "failed"
        ? "Não recebemos a aprovação do Mercado Pago. Você pode acompanhar o pedido ou tentar novamente pelo suporte."
        : viewStatus === "cash_pending"
          ? "O pedido foi enviado para a distribuidora. O pagamento em dinheiro será cobrado na entrega."
        : "Recebemos seu pedido e estamos aguardando a confirmação do Mercado Pago.";
  const canResumePayment = Boolean(orderId && viewStatus === "pending");
  const cashChangeForCents = statusData?.payment?.cash_change_for_cents ?? null;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 px-4 text-center">
      <div className={`flex h-20 w-20 items-center justify-center rounded-full ${iconBg}`}>
        <Icon className={`h-10 w-10 ${iconClass}`} />
      </div>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white/95 px-6 py-6 shadow-[0_4px_24px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <h1 className="text-xl font-bold font-heading text-[#191c1d]">{loading ? "Atualizando status..." : title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {orderId && (
          <p className="break-all text-xs text-muted-foreground">Pedido #{orderId}</p>
        )}
        {viewStatus === "cash_pending" && statusData?.payment && (
          <p className="text-xs font-semibold text-[#805300]">
            {cashChangeForCents == null
              ? "Pagamento em valor exato."
              : `Troco para ${formatCurrency(cashChangeForCents)}.`}
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {canResumePayment && (
          <Link href={`/checkout/payment?orderId=${encodeURIComponent(orderId!)}`}>
            <Button className="gap-1.5 rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] shadow-none hover:opacity-90 active:scale-[0.98]">
              <CreditCard className="h-4 w-4" /> Retomar pagamento
            </Button>
          </Link>
        )}
        <Link href={orderId ? `/orders/${orderId}` : "/orders"}>
          <Button variant={canResumePayment ? "outline" : "default"} className={canResumePayment ? "rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]" : "rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] shadow-none hover:opacity-90 active:scale-[0.98]"}>
            Ver pedido
          </Button>
        </Link>
        <Link href="/catalog">
          <Button variant="outline" className="gap-1.5 rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]">
            <ShoppingCart className="h-4 w-4" /> Continuar comprando
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutConfirmationPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center px-4"><p className="text-muted-foreground">Carregando...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
