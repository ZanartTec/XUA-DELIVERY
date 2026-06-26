"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpInput } from "@/src/components/shared/driver/otp-input";
import { Button } from "@/src/components/ui/button";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Banknote } from "lucide-react";
import { isCashPaymentMethod } from "@xua/shared/mappers/payment";

const SUPPORT_PHONE_LABEL = "(11) 99001-1005";
const SUPPORT_PHONE_LINK = "tel:+5511990011005";

interface PaymentSummary {
  id: string;
  status: string;
  amount_cents: number;
  payment_method?: string | null;
  cash_change_for_cents?: number | null;
}

interface OrderDetail {
  total_cents: number;
  payments: PaymentSummary[];
}

export default function OtpVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [locked, setLocked] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrderDetail() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (!cancelled) setOrderDetail(body.order ?? null);
      } catch {
        if (!cancelled) setOrderDetail(null);
      }
    }

    void loadOrderDetail();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const cashPayment = orderDetail?.payments.find((payment) => isCashPaymentMethod(payment.payment_method)) ?? null;
  const cashChangeForCents = cashPayment?.cash_change_for_cents ?? null;
  const cashAmountCents = cashPayment?.amount_cents ?? orderDetail?.total_cents ?? 0;

  async function handleComplete(code: string) {
    if (locked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}/verify-otp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAttempts(body.attempts ?? attempts + 1);
        setMaxAttempts(body.max_attempts ?? 5);
        setLocked(res.status === 429 || body.code === "OTP_LOCKED");
        setError(body.error || "Código inválido");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setInputKey((current) => current + 1);
        return;
      }

      navigator.vibrate?.(120);

      router.push(`/driver/deliveries/${id}/exchange`);
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
        <h2 className="text-center text-lg font-bold font-heading">Verificar OTP</h2>
        <p className="text-sm text-muted-foreground text-center">
          Peça o código de 6 dígitos ao consumidor para confirmar a entrega do pedido #{id}.
        </p>
        {cashPayment && (
          <div className="rounded-2xl border border-[#ffe099] bg-[#fff8e6] px-4 py-3 text-[#7a4700]">
            <div className="flex items-start gap-3">
              <Banknote className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">Cobrar {formatCurrency(cashAmountCents)} em dinheiro</p>
                <p className="mt-1 text-xs font-medium text-[#805300]">
                  {cashChangeForCents == null
                    ? "Receba o valor exato antes de validar o OTP."
                    : `Troco para ${formatCurrency(cashChangeForCents)}. Troco estimado: ${formatCurrency(Math.max(cashChangeForCents - cashAmountCents, 0))}.`}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className={cn(shake && "animate-shake")}>
          <OtpInput key={inputKey} onComplete={handleComplete} disabled={loading || locked} />
        </div>
        {attempts > 0 && !locked && (
          <p className="text-center text-xs text-muted-foreground">
            Tentativa {attempts} de {maxAttempts}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
        {locked && (
          <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-center text-sm text-amber-800">
            <p>Código bloqueado. Contate o suporte para override.</p>
            <a href={SUPPORT_PHONE_LINK} className="font-semibold underline underline-offset-2">
              Ligar para suporte: {SUPPORT_PHONE_LABEL}
            </a>
          </div>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground text-center">Verificando...</p>
        )}
        {!locked && (
          <Button
            className="w-full rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            onClick={() => router.push(`/driver/deliveries/${id}/failure`)}
          >
            Não foi possível concluir a entrega
          </Button>
        )}
        <Button
          className="w-full rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
          onClick={() => router.back()}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}
