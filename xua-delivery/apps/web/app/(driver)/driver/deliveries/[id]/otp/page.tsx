"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpInput } from "@/src/components/shared/driver/otp-input";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { useOfflineSync } from "@/src/hooks/use-offline-sync";
import { useIsClient } from "@/src/hooks/use-is-client";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Banknote, CreditCard, FileText, WifiOff } from "lucide-react";
import { openReceipt, orderReceiptUrl, readReceiptFormat } from "@/src/lib/receipt";
import { isCashPaymentMethod, isOfflinePaymentMethod } from "@xua/shared/mappers/payment";

const SUPPORT_PHONE_LABEL = "(11) 99001-1005";
const SUPPORT_PHONE_LINK = "tel:+5511990011005";

const CONDITIONS = [
  { value: "ok", label: "OK" },
  { value: "damaged", label: "Danificado" },
  { value: "dirty", label: "Sujo" },
] as const;

type Condition = (typeof CONDITIONS)[number]["value"];
type ShortfallResolution = "charge" | "partial";
type ExtraPaymentMethod = "cash" | "card_on_delivery";

interface PaymentSummary {
  id: string;
  status: string;
  amount_cents: number;
  payment_method?: string | null;
  cash_change_for_cents?: number | null;
}

interface BottleGroup {
  bottle_product_id: string;
  bottle_name: string;
  unit_price_cents: number;
  required_empties: number;
  refil_items: { quantity: number; unit_price_cents: number }[];
}

interface OrderDetail {
  total_cents: number;
  total_items_qty?: number;
  payments: PaymentSummary[];
  bottle_groups?: BottleGroup[];
}

/**
 * Regra de vasilhame na entrega, com a mesma alocação do servidor: os vazios
 * recebidos cobrem os grupos de vasilhame na ordem do pedido; o que faltar em
 * cada grupo pode ser cobrado (preço do vasilhame) ou retirado do pedido
 * (entrega parcial, removendo as unidades refil daquele grupo na ordem).
 */
function simulateShortfall(groups: BottleGroup[], collected: number) {
  let remaining = collected;
  let missing = 0;
  let chargeCents = 0;
  let removedCents = 0;

  for (const group of groups) {
    const given = Math.min(remaining, group.required_empties);
    remaining -= given;
    const groupMissing = group.required_empties - given;
    missing += groupMissing;
    chargeCents += groupMissing * group.unit_price_cents;

    let pending = groupMissing;
    for (const item of group.refil_items) {
      const take = Math.min(pending, item.quantity);
      removedCents += take * item.unit_price_cents;
      pending -= take;
    }
  }

  return { missing, chargeCents, removedCents };
}

function pluralVasilhame(n: number) {
  return `${n} ${n === 1 ? "vasilhame" : "vasilhames"}`;
}

/**
 * Conclusão da entrega numa tela só: vazios recebidos (+ como resolver os que
 * faltaram) e código do cliente, numa requisição só — ou tudo é gravado, ou nada.
 */
export default function CompleteDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isOnline: onlineState } = useOfflineSync();
  // O estado de conexão só existe no navegador: no SSR assume online, para o
  // HTML do servidor bater com o da primeira renderização (hidratação).
  const isClient = useIsClient();
  const isOnline = !isClient || onlineState;

  const [collectedQty, setCollectedQty] = useState<number | null>(null);
  const [condition, setCondition] = useState<Condition>("ok");
  const [resolution, setResolution] = useState<ShortfallResolution | null>(null);
  const [extraMethod, setExtraMethod] = useState<ExtraPaymentMethod>("cash");

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

  const groups = useMemo(() => orderDetail?.bottle_groups ?? [], [orderDetail]);
  const requiredEmpties = groups.reduce((acc, g) => acc + g.required_empties, 0);
  const quantityOptions = Array.from({ length: Math.max(requiredEmpties, 3) + 1 }, (_, i) => i);

  // Pagamento recebido pelo motorista (dinheiro ou maquininha), se houver.
  const doorPayment =
    orderDetail?.payments.find(
      (p) => isOfflinePaymentMethod(p.payment_method) && p.status !== "CAPTURED"
    ) ?? null;
  const paidOnline = orderDetail != null && doorPayment == null;
  const isCash = isCashPaymentMethod(doorPayment?.payment_method);

  const shortfall = simulateShortfall(groups, collectedQty ?? requiredEmpties);
  const hasShortfall = collectedQty !== null && shortfall.missing > 0;
  const partialLeavesItems =
    (orderDetail?.total_items_qty ?? Infinity) - shortfall.missing > 0;
  const canPartial = !paidOnline && partialLeavesItems;

  // Se o cenário muda (outra contagem), a escolha anterior pode não valer mais.
  useEffect(() => {
    if (!hasShortfall || (resolution === "partial" && !canPartial)) setResolution(null);
  }, [hasShortfall, canPartial, resolution]);

  const baseDueCents = doorPayment?.amount_cents ?? 0;
  const extraDueCents =
    hasShortfall && resolution === "charge"
      ? shortfall.chargeCents
      : hasShortfall && resolution === "partial"
        ? -shortfall.removedCents
        : 0;
  const dueCents = baseDueCents + (paidOnline ? 0 : extraDueCents);
  const onlineExtraCents = paidOnline && resolution === "charge" ? shortfall.chargeCents : 0;
  const cashChangeForCents = isCash ? (doorPayment?.cash_change_for_cents ?? null) : null;

  const bottleStepReady =
    collectedQty !== null && (!hasShortfall || resolution !== null);

  function buildBottleStep() {
    return {
      kind: "exchange",
      collected_empty_qty: collectedQty,
      returned_empty_qty: collectedQty,
      bottle_condition: condition,
      ...(hasShortfall && resolution ? { shortfall_resolution: resolution } : {}),
      ...(hasShortfall && resolution === "charge" && paidOnline
        ? { extra_payment_method: extraMethod }
        : {}),
    };
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
        const otpError = body.code === "OTP_INVALID" || body.code === "OTP_LOCKED";
        if (otpError) {
          setAttempts(body.attempts ?? attempts + 1);
          setMaxAttempts(body.max_attempts ?? 5);
          setLocked(res.status === 429 || body.code === "OTP_LOCKED");
          setShake(true);
          setTimeout(() => setShake(false), 500);
        }
        setError(body.error || "Não foi possível concluir a entrega.");
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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white/95 p-5 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <div className="space-y-1 text-center">
          <h2 className="font-heading text-lg font-bold">Concluir entrega</h2>
          <p className="text-sm text-muted-foreground">
            Pedido #{id.slice(0, 8).toUpperCase()} — registre os vazios e confirme com o código do cliente.
          </p>
        </div>

        {/* Valor a receber (atualiza conforme os vazios e a escolha do motorista) */}
        {orderDetail && (doorPayment || onlineExtraCents > 0) && (
          <div className="rounded-2xl border border-[#ffe099] bg-[#fff8e6] px-4 py-3 text-[#7a4700]">
            <div className="flex items-start gap-3">
              {isCash || (paidOnline && extraMethod === "cash") ? (
                <Banknote className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <CreditCard className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {paidOnline
                    ? `Cobrar ${formatCurrency(onlineExtraCents)} do vasilhame`
                    : `Cobrar ${formatCurrency(dueCents)} ${isCash ? "em dinheiro" : "no cartão"}`}
                </p>
                <p className="mt-1 text-xs font-medium text-[#805300]">
                  {paidOnline
                    ? "Pedido já pago no app. Receba só o valor do vasilhame."
                    : isCash
                      ? cashChangeForCents == null
                        ? "Receba o valor exato antes de confirmar."
                        : `Troco para ${formatCurrency(cashChangeForCents)}. Troco estimado: ${formatCurrency(Math.max(cashChangeForCents - dueCents, 0))}.`
                      : "Passe na maquininha antes de confirmar."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Passo 1 — vazios recebidos */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vasilhames vazios recebidos
          </p>
          {requiredEmpties > 0 && (
            <p className="text-xs text-muted-foreground">
              Este pedido exige {pluralVasilhame(requiredEmpties)} vazio{requiredEmpties === 1 ? "" : "s"} para troca.
            </p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {quantityOptions.map((qty) => (
              <button
                key={qty}
                type="button"
                aria-pressed={collectedQty === qty}
                onClick={() => setCollectedQty(qty)}
                className={cn(
                  "h-12 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  collectedQty === qty ? "bg-accent text-accent-foreground" : "bg-muted text-foreground hover:bg-muted/70"
                )}
              >
                {qty}
              </button>
            ))}
          </div>
        </div>

        {/* Vazios faltaram: como resolver */}
        {hasShortfall && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              {shortfall.missing === 1 ? "Faltou" : "Faltaram"} {pluralVasilhame(shortfall.missing)}. Como resolver?
            </p>
            <RadioGroup
              value={resolution ?? ""}
              onValueChange={(value) => setResolution(value as ShortfallResolution)}
              className="gap-2"
            >
              <Label
                htmlFor="resolution-charge"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id="resolution-charge" value="charge" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">
                    Cobrar vasilhame (+ {formatCurrency(shortfall.chargeCents)})
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Entrega tudo e o cliente fica com o vasilhame.
                  </span>
                </span>
              </Label>
              {canPartial && (
                <Label
                  htmlFor="resolution-partial"
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white p-3 has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id="resolution-partial" value="partial" className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-semibold">
                      Entregar só o que tem troca (− {formatCurrency(shortfall.removedCents)})
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Volta com {shortfall.missing} unidade{shortfall.missing === 1 ? "" : "s"} para a distribuidora.
                    </span>
                  </span>
                </Label>
              )}
            </RadioGroup>

            {resolution === "charge" && paidOnline && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-amber-900">Recebido em</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "cash", label: "Dinheiro" },
                      { value: "card_on_delivery", label: "Cartão" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={extraMethod === option.value}
                      onClick={() => setExtraMethod(option.value)}
                      className={cn(
                        "h-10 rounded-xl text-sm font-semibold",
                        extraMethod === option.value ? "bg-accent text-accent-foreground" : "bg-white text-foreground"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => router.push(`/driver/deliveries/${id}/failure?motivo=sem-vasilhame`)}
            >
              Cliente não quer pagar — cancelar entrega
            </Button>
          </div>
        )}

        {collectedQty !== null && collectedQty > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Condição dos vazios
            </p>
            <div className="flex gap-2">
              {CONDITIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={condition === item.value}
                  onClick={() => setCondition(item.value)}
                  className={cn(
                    "h-10 flex-1 rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    condition === item.value ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Passo 2 — código do cliente */}
        <div className="space-y-1.5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Código do cliente
          </p>
          {!bottleStepReady && (
            <p className="text-xs text-muted-foreground">
              {collectedQty === null
                ? "Informe os vazios recebidos para liberar a confirmação."
                : "Escolha como resolver os vasilhames que faltaram."}
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

        {/* Comprovante de venda (sem valor fiscal) para entregar ao cliente */}
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() => openReceipt(orderReceiptUrl(id, readReceiptFormat("thermal")))}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Ver comprovante de venda
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-11 rounded-xl"
            onClick={() => router.push("/driver/deliveries")}
          >
            Voltar
          </Button>
          {!locked && (
            <Button
              variant="ghost"
              className="h-11 rounded-xl text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => router.push(`/driver/deliveries/${id}/failure`)}
            >
              Não consegui entregar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
