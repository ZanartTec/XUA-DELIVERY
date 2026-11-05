"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Banknote, CreditCard, FileText, Loader2, Phone, WifiOff } from "lucide-react";
import { OtpInput } from "@/src/components/shared/driver/otp-input";
import { PageHeader } from "@/src/components/shared/page-header";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { useOfflineSync } from "@/src/hooks/use-offline-sync";
import { useIsClient } from "@/src/hooks/use-is-client";
import { cn, formatCurrency } from "@/src/lib/utils";
import { phoneHref, plural } from "@/src/lib/format";
import { openReceipt, orderReceiptUrl, readReceiptFormat } from "@/src/lib/receipt";
import { isCashPaymentMethod, isOfflinePaymentMethod } from "@xua/shared/mappers/payment";

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
  consumer_name?: string;
  distributor_phone?: string | null;
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

  const distributorTel = phoneHref(orderDetail?.distributor_phone);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back={`/driver/deliveries/${id}`}
        eyebrow={`Pedido #${id.slice(0, 8).toUpperCase()}`}
        title="Concluir entrega"
        description={orderDetail?.consumer_name ?? undefined}
      />

      <div className="space-y-4 px-4 pb-4">
        {/* Valor a receber (atualiza conforme os vazios e a escolha do motorista) */}
        {orderDetail && (doorPayment || onlineExtraCents > 0) ? (
          <section className="flex items-start gap-3 rounded-2xl bg-warning-surface p-4 text-warning-foreground" aria-live="polite">
            {isCash || (paidOnline && extraMethod === "cash") ? (
              <Banknote className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            ) : (
              <CreditCard className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-heading text-lg font-bold">
                {paidOnline
                  ? `Cobrar ${formatCurrency(onlineExtraCents)} do vasilhame`
                  : `Cobrar ${formatCurrency(dueCents)} ${isCash ? "em dinheiro" : "no cartão"}`}
              </p>
              <p className="text-sm">
                {paidOnline
                  ? "Pedido já pago no app. Receba só o valor do vasilhame."
                  : isCash
                    ? cashChangeForCents == null
                      ? "Receba o valor exato antes de confirmar."
                      : `Troco para ${formatCurrency(cashChangeForCents)} · devolver ${formatCurrency(Math.max(cashChangeForCents - dueCents, 0))}.`
                    : "Passe na maquininha antes de confirmar."}
              </p>
            </div>
          </section>
        ) : orderDetail ? (
          <section className="flex items-center gap-3 rounded-2xl bg-success-surface p-4 text-success-foreground">
            <CreditCard className="size-5 shrink-0" aria-hidden="true" />
            <p className="font-semibold">Pedido pago no app · nada a cobrar</p>
          </section>
        ) : null}

        {/* Passo 1 — vazios recebidos */}
        <section aria-labelledby="passo-vazios" className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
          <div>
            <h2 id="passo-vazios" className="text-sm font-semibold text-foreground">
              1. Quantos vasilhames vazios você recebeu?
            </h2>
            {requiredEmpties > 0 ? (
              <p className="text-xs text-muted-foreground">
                O pedido pede {pluralVasilhame(requiredEmpties)} para troca.
              </p>
            ) : null}
          </div>
          <ToggleGroup
            type="single"
            value={collectedQty === null ? "" : String(collectedQty)}
            onValueChange={(v) => v !== "" && setCollectedQty(Number(v))}
            aria-label="Vazios recebidos"
            className="grid w-full grid-cols-4 gap-2"
            spacing={2}
          >
            {quantityOptions.map((qty) => (
              <ToggleGroupItem
                key={qty}
                value={String(qty)}
                className="h-12 rounded-xl bg-surface-low font-heading text-lg font-bold data-[state=on]:bg-cta data-[state=on]:text-cta-foreground"
              >
                {qty}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {collectedQty !== null && collectedQty > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Estado dos vazios</p>
              <ToggleGroup
                type="single"
                value={condition}
                onValueChange={(v) => v && setCondition(v as Condition)}
                aria-label="Estado dos vazios"
                className="grid w-full grid-cols-3"
                spacing={2}
              >
                {CONDITIONS.map((item) => (
                  <ToggleGroupItem
                    key={item.value}
                    value={item.value}
                    className="h-11 rounded-xl bg-surface-low data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-primary"
                  >
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ) : null}

          {/* Vazios faltaram: como resolver */}
          {hasShortfall ? (
            <div className="space-y-2 rounded-xl bg-warning-surface p-3">
              <p className="text-sm font-semibold text-warning-foreground">
                {shortfall.missing === 1 ? "Faltou" : "Faltaram"} {pluralVasilhame(shortfall.missing)}. Como resolver?
              </p>
              <RadioGroup
                value={resolution ?? ""}
                onValueChange={(value) => setResolution(value as ShortfallResolution)}
                className="gap-2"
              >
                <Label
                  htmlFor="resolution-charge"
                  className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-card p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary"
                >
                  <RadioGroupItem id="resolution-charge" value="charge" className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-semibold">Cobrar o vasilhame (+ {formatCurrency(shortfall.chargeCents)})</span>
                    <span className="block text-xs text-muted-foreground">Entrega tudo e o cliente fica com o vasilhame.</span>
                  </span>
                </Label>
                {canPartial ? (
                  <Label
                    htmlFor="resolution-partial"
                    className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-card p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary"
                  >
                    <RadioGroupItem id="resolution-partial" value="partial" className="mt-0.5" />
                    <span className="space-y-0.5">
                      <span className="block text-sm font-semibold">
                        Entregar só o que tem troca (− {formatCurrency(shortfall.removedCents)})
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Volta com {plural(shortfall.missing, "unidade", "unidades")} para a distribuidora.
                      </span>
                    </span>
                  </Label>
                ) : null}
              </RadioGroup>

              {resolution === "charge" && paidOnline ? (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-semibold text-warning-foreground">Recebido em</p>
                  <ToggleGroup
                    type="single"
                    value={extraMethod}
                    onValueChange={(v) => v && setExtraMethod(v as ExtraPaymentMethod)}
                    className="grid w-full grid-cols-2"
                    spacing={2}
                  >
                    <ToggleGroupItem value="cash" className="h-11 rounded-xl bg-card data-[state=on]:bg-cta data-[state=on]:text-cta-foreground">
                      Dinheiro
                    </ToggleGroupItem>
                    <ToggleGroupItem value="card_on_delivery" className="h-11 rounded-xl bg-card data-[state=on]:bg-cta data-[state=on]:text-cta-foreground">
                      Cartão
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              ) : null}

              <Button
                type="button"
                variant="link"
                className="h-auto w-full py-1 text-sm text-destructive"
                onClick={() => router.push(`/driver/deliveries/${id}/failure?motivo=sem-vasilhame`)}
              >
                Cliente não quer pagar — cancelar a entrega
              </Button>
            </div>
          ) : null}
        </section>

        {/* Passo 2 — código do cliente (na zona do polegar) */}
        <section
          aria-labelledby="passo-codigo"
          className={cn("space-y-3 rounded-2xl border border-hairline bg-card p-4", !bottleStepReady && "opacity-60")}
        >
          <div>
            <h2 id="passo-codigo" className="text-sm font-semibold text-foreground">
              2. Código do cliente
            </h2>
            <p className="text-xs text-muted-foreground">
              {collectedQty === null
                ? "Informe os vazios para liberar o código."
                : !bottleStepReady
                  ? "Escolha como resolver os vasilhames que faltaram."
                  : "O cliente vê o código no app, na tela do pedido. A entrega conclui ao digitar os 6 números."}
            </p>
          </div>
          <div className={cn(shake && "animate-shake")}>
            <OtpInput key={inputKey} onComplete={handleComplete} disabled={loading || locked || !bottleStepReady || !isOnline} />
          </div>

          {loading ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Confirmando…
            </p>
          ) : null}
          {attempts > 0 && !locked ? (
            <p className="text-center text-xs text-muted-foreground">
              Tentativa {attempts} de {maxAttempts}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-center text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </section>

        {!isOnline ? (
          <Alert className="border-warning/30 bg-warning-surface">
            <WifiOff className="text-warning-foreground" aria-hidden="true" />
            <AlertDescription className="text-warning-foreground">
              Sem conexão. A confirmação por código precisa de internet. Se não voltar, avise a distribuidora para liberar a
              entrega pela central.
            </AlertDescription>
          </Alert>
        ) : null}

        {locked ? (
          <Alert variant="destructive">
            <AlertDescription className="space-y-2">
              <p>Código bloqueado após várias tentativas. A distribuidora pede a liberação à central.</p>
              {distributorTel ? (
                <Button asChild variant="destructive-soft" size="lg">
                  <a href={distributorTel}>
                    <Phone /> Ligar para a distribuidora
                  </a>
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="xl"
            className="px-2"
            onClick={() => openReceipt(orderReceiptUrl(id, readReceiptFormat("thermal")))}
          >
            <FileText aria-hidden="true" /> Comprovante
          </Button>
          {!locked ? (
            <Button asChild variant="outline" size="xl" className="px-2 text-destructive">
              <Link href={`/driver/deliveries/${id}/failure`}>Não entreguei</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
