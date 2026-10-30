"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpInput } from "@/src/components/shared/driver/otp-input";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { useOfflineSync } from "@/src/hooks/use-offline-sync";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Banknote, WifiOff } from "lucide-react";
import { isCashPaymentMethod } from "@xua/shared/mappers/payment";

const SUPPORT_PHONE_LABEL = "(11) 99001-1005";
const SUPPORT_PHONE_LINK = "tel:+5511990011005";

const QUANTITY_OPTIONS = [0, 1, 2, 3, 4, 5];

const CONDITIONS = [
  { value: "ok", label: "OK" },
  { value: "damaged", label: "Danificado" },
  { value: "dirty", label: "Sujo" },
] as const;

const NON_COLLECTION_REASONS = [
  { value: "client_absent", label: "Cliente ausente" },
  { value: "no_access", label: "Sem acesso ao local" },
  { value: "no_empty_bottles", label: "Sem vasilhame" },
  { value: "unsafe_location", label: "Local inseguro" },
  { value: "other", label: "Outro" },
] as const;

type Condition = (typeof CONDITIONS)[number]["value"];
type NonCollectionReason = (typeof NON_COLLECTION_REASONS)[number]["value"];

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

/**
 * Conclusão da entrega numa tela só: vasilhame + código do cliente.
 *
 * Antes eram duas telas em sequência, e o pedido já era marcado como entregue
 * assim que o código era confirmado — a tela de vasilhame vinha depois e, na
 * prática, era opcional. Se o motorista fechasse o app no meio, a entrega
 * ficava concluída para sempre sem ninguém saber quantos garrafões voltaram.
 * Aqui os dois dados saem juntos, numa requisição só: ou as duas coisas são
 * gravadas, ou nenhuma é.
 */
export default function CompleteDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isOnline } = useOfflineSync();

  const [returnedQty, setReturnedQty] = useState<number | null>(null);
  const [condition, setCondition] = useState<Condition>("ok");
  const [reason, setReason] = useState<NonCollectionReason | "">("");
  const [notes, setNotes] = useState("");

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

  const cashPayment =
    orderDetail?.payments.find((payment) => isCashPaymentMethod(payment.payment_method)) ?? null;
  const cashChangeForCents = cashPayment?.cash_change_for_cents ?? null;
  const cashAmountCents = cashPayment?.amount_cents ?? orderDetail?.total_cents ?? 0;

  const isNonCollection = returnedQty === 0;
  const needsDetails = reason === "other";

  // O código só é liberado depois do vasilhame resolvido: é a mesma regra que o
  // servidor aplica, só que aqui ela vira ordem natural da tela em vez de erro.
  const bottleStepReady =
    returnedQty !== null &&
    (!isNonCollection || (reason !== "" && (!needsDetails || notes.trim().length >= 10)));

  function buildBottleStep() {
    if (isNonCollection) {
      return { kind: "not_collected", reason, notes: notes.trim() || undefined };
    }
    return { kind: "exchange", returned_empty_qty: returnedQty, bottle_condition: condition };
  }

  async function handleComplete(code: string) {
    if (locked || !bottleStepReady) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}/verify-otp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, bottle_step: buildBottleStep() }),
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
      router.push("/driver/deliveries");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
        <h2 className="text-center text-lg font-bold font-heading">Concluir entrega</h2>
        <p className="text-sm text-muted-foreground text-center">
          Pedido #{id} — registre o vasilhame e confirme com o código do cliente.
        </p>

        {cashPayment && (
          <div className="rounded-2xl border border-[#ffe099] bg-[#fff8e6] px-4 py-3 text-[#7a4700]">
            <div className="flex items-start gap-3">
              <Banknote className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  Cobrar {formatCurrency(cashAmountCents)} em dinheiro
                </p>
                <p className="mt-1 text-xs font-medium text-[#805300]">
                  {cashChangeForCents == null
                    ? "Receba o valor exato antes de confirmar."
                    : `Troco para ${formatCurrency(cashChangeForCents)}. Troco estimado: ${formatCurrency(Math.max(cashChangeForCents - cashAmountCents, 0))}.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Passo 1 — vasilhame */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Garrafões vazios coletados
          </label>
          <div className="grid grid-cols-3 gap-2">
            {QUANTITY_OPTIONS.map((qty) => (
              <button
                key={qty}
                type="button"
                aria-pressed={returnedQty === qty}
                onClick={() => setReturnedQty(qty)}
                className={cn(
                  "rounded-xl px-3 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  returnedQty === qty
                    ? "bg-[#00E0FF] text-[#001735]"
                    : "bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                )}
              >
                {qty === 5 ? "5+" : qty}
              </button>
            ))}
          </div>
        </div>

        {returnedQty !== null && returnedQty > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Condição
            </label>
            <div className="flex gap-2">
              {CONDITIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={condition === item.value}
                  onClick={() => setCondition(item.value)}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    condition === item.value
                      ? "bg-[#00E0FF] text-[#001735]"
                      : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isNonCollection && (
          <div className="space-y-3 rounded-xl bg-[#5697E9]/10 p-3">
            <div className="space-y-1.5">
              <label
                htmlFor="non-collection-reason"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Motivo da não coleta *
              </label>
              <select
                id="non-collection-reason"
                value={reason}
                aria-required="true"
                onChange={(event) => setReason(event.target.value as NonCollectionReason)}
                className="w-full rounded-xl border-0 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {NON_COLLECTION_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="non-collection-notes"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Observações{needsDetails ? " *" : ""}
              </label>
              <Textarea
                id="non-collection-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="h-20 resize-none rounded-xl border-0 bg-white px-3 py-2 text-sm"
                placeholder={
                  needsDetails ? "Descreva o motivo da não coleta..." : "Detalhes adicionais..."
                }
              />
            </div>
          </div>
        )}

        {/* Passo 2 — código do cliente */}
        <div className="space-y-1.5 border-t border-[#e4e8f1] pt-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Código do cliente
          </label>
          {!bottleStepReady && (
            <p className="text-xs text-muted-foreground">
              Registre o vasilhame acima para liberar a confirmação.
            </p>
          )}
          <div className={cn(shake && "animate-shake", !bottleStepReady && "opacity-50")}>
            <OtpInput
              key={inputKey}
              onComplete={handleComplete}
              disabled={loading || locked || !bottleStepReady || !isOnline}
            />
          </div>
        </div>

        {!isOnline && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Sem conexão. A confirmação por código precisa de internet — se não voltar, avise a
              central para liberar a entrega pelo painel.
            </p>
          </div>
        )}

        {attempts > 0 && !locked && (
          <p className="text-center text-xs text-muted-foreground">
            Tentativa {attempts} de {maxAttempts}
          </p>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}

        {locked && (
          <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-center text-sm text-amber-800">
            <p>Código bloqueado. Contate o suporte para override.</p>
            <a href={SUPPORT_PHONE_LINK} className="font-semibold underline underline-offset-2">
              Ligar para suporte: {SUPPORT_PHONE_LABEL}
            </a>
          </div>
        )}

        {loading && <p className="text-center text-sm text-muted-foreground">Confirmando...</p>}

        {!locked && (
          <Button
            className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-red-700 hover:bg-red-100 active:scale-[0.98]"
            onClick={() => router.push(`/driver/deliveries/${id}/failure`)}
          >
            Não foi possível concluir a entrega
          </Button>
        )}

        <Button
          className="w-full rounded-xl border-0 bg-[#e1e3e4] py-3 text-foreground hover:bg-[#d1d3d4]"
          onClick={() => router.push("/driver/deliveries")}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}
