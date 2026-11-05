"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock3, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { CheckoutProgress } from "@/src/components/consumer/checkout-progress";
import { useOrderDetail } from "@/src/hooks/consumer/use-order-detail";
import { cn, formatCurrency, formatDate } from "@/src/lib/utils";
import { formatScheduledTime, formatShortOrderId } from "@/src/lib/order-detail-format";
import { isCashPaymentMethod, isOfflinePaymentMethod } from "@xua/shared/mappers/payment";

type PaymentViewStatus = "loading" | "approved" | "pending" | "failed" | "created" | "cash_pending";

interface PaymentStatusResponse {
  order: { id: string; status: string; payment_status: string | null; total_cents: number };
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
  // Pago na entrega (dinheiro ou cartão na maquininha): pedido já confirmado.
  if (isOfflinePaymentMethod(data.payment?.payment_method) && data.payment.status !== "CAPTURED") return "cash_pending";
  if (data.payment?.status === "CAPTURED" || data.order.payment_status === "paid") return "approved";
  if (data.payment?.status === "FAILED" || data.order.payment_status === "failed") return "failed";
  if (data.payment?.status === "REFUNDED" || data.order.payment_status === "refunded") return "failed";
  if (data.order.status === "PAYMENT_PENDING" || data.payment?.status === "CREATED") return "pending";
  return "created";
}

function isTerminalPaymentStatus(status: PaymentViewStatus): boolean {
  return status === "approved" || status === "failed" || status === "cash_pending";
}

const VIEW: Record<PaymentViewStatus, { icon: typeof CheckCircle2; tone: string; title: string }> = {
  loading: { icon: Loader2, tone: "bg-secondary text-primary", title: "Atualizando status…" },
  approved: { icon: CheckCircle2, tone: "bg-success-surface text-success-foreground", title: "Pagamento aprovado!" },
  cash_pending: { icon: CheckCircle2, tone: "bg-success-surface text-success-foreground", title: "Pedido confirmado!" },
  created: { icon: CheckCircle2, tone: "bg-success-surface text-success-foreground", title: "Pedido recebido!" },
  pending: { icon: Clock3, tone: "bg-warning-surface text-warning-foreground", title: "Aguardando pagamento" },
  failed: { icon: AlertCircle, tone: "bg-danger-surface text-destructive", title: "Pagamento não aprovado" },
};

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const paymentStatusParam = searchParams.get("paymentStatus");
  const [statusData, setStatusData] = useState<PaymentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { order } = useOrderDetail(orderId ?? "");

  const viewStatus = useMemo(() => getViewStatus(statusData, paymentStatusParam), [statusData, paymentStatusParam]);

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
          if (isTerminalPaymentStatus(getViewStatus(body, paymentStatusParam))) window.clearInterval(interval);
        }
      } catch {
        if (!cancelled) setError("Não foi possível atualizar o status do pagamento.");
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

  const view = VIEW[viewStatus];
  const Icon = view.icon;
  const paymentMethod = statusData?.payment?.payment_method;
  const message =
    viewStatus === "approved"
      ? "Seu pedido foi confirmado e segue para a distribuidora."
      : viewStatus === "failed"
        ? "O Mercado Pago não aprovou o pagamento. Você pode acompanhar o pedido ou falar com o suporte."
        : viewStatus === "cash_pending"
          ? isCashPaymentMethod(paymentMethod)
            ? "Enviamos o pedido para a distribuidora. O pagamento em dinheiro é feito na entrega."
            : "Enviamos o pedido para a distribuidora. O pagamento no cartão é feito na maquininha do entregador."
          : viewStatus === "loading"
            ? ""
            : "Recebemos seu pedido e estamos aguardando a confirmação do Mercado Pago.";
  const canResumePayment = Boolean(orderId && viewStatus === "pending");
  const cashChangeForCents = statusData?.payment?.cash_change_for_cents ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-4">
      <CheckoutProgress current={2} />

      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <div className={cn("flex size-20 items-center justify-center rounded-full", view.tone)}>
          <Icon className={cn("size-10", viewStatus === "loading" && "animate-spin")} aria-hidden />
        </div>
        <div className="space-y-1" aria-live="polite">
          <h1 className="font-heading text-2xl font-bold text-ink">{view.title}</h1>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>

      {orderId ? (
        <Card className="flex flex-col mt-6 gap-3 rounded-2xl border-hairline p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pedido</span>
            <span className="font-semibold text-foreground">#{formatShortOrderId(orderId)}</span>
          </div>
          {order ? (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Entrega</span>
                <span className="text-right font-medium text-foreground">
                  {formatDate(order.delivery_date)} · {formatScheduledTime(order)}
                </span>
              </div>
              {order.distributor_name ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Distribuidora</span>
                  <span className="text-right font-medium text-foreground">{order.distributor_name}</span>
                </div>
              ) : null}
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-heading text-lg font-bold text-primary">{formatCurrency(order.total_cents)}</span>
              </div>
            </>
          ) : null}
          {viewStatus === "cash_pending" && isCashPaymentMethod(paymentMethod) ? (
            <p className="text-xs font-medium text-warning-foreground">
              {cashChangeForCents == null ? "Pagamento em valor exato." : `Troco para ${formatCurrency(cashChangeForCents)}.`}
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </Card>
      ) : null}

      <div className="mt-4 text-center">
        <Button asChild variant="link">
          <Link href="/catalog">Continuar comprando</Link>
        </Button>
      </div>

      <StickyActionBar>
        {canResumePayment ? (
          <Button asChild variant="cta" size="xl">
            <Link href={`/checkout/payment?orderId=${encodeURIComponent(orderId!)}`}>
              <CreditCard /> Retomar pagamento
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={canResumePayment ? "outline" : "cta"} size="xl">
          <Link href={orderId ? `/orders/${orderId}` : "/orders"}>Acompanhar pedido</Link>
        </Button>
      </StickyActionBar>
    </div>
  );
}

export default function CheckoutConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Carregando" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
