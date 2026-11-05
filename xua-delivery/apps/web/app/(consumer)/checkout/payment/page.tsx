"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Building2, CalendarDays, Droplets, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { useCartStore } from "@/src/store/cart";
import { useCheckoutStore } from "@/src/store/checkout";
import { cn, formatCurrency } from "@/src/lib/utils";
import { plural } from "@/src/lib/format";
import { isoDayToDate } from "@/src/lib/datetime";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";
import { api } from "@/src/lib/api-client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/src/components/ui/accordion";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { PageHeader } from "@/src/components/shared/page-header";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { CheckoutProgress } from "@/src/components/consumer/checkout-progress";
import { PaymentMethodSelector } from "@/src/components/consumer/payment-method-selector";
import { BottleExchangeNotice } from "@/src/components/consumer/bottle-exchange-notice";
import { useSelectedAddress, formatAddressLine } from "@/src/hooks/consumer/use-addresses";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useDistributorPaymentMethods, hiddenCheckoutMethods } from "@/src/hooks/use-distributor-payment-methods";
import { CHECKOUT_PAYMENT_METHOD_VALUES } from "@xua/shared/enums";
import {
  CARD_ON_DELIVERY_PAYMENT_METHOD,
  CASH_PAYMENT_METHOD,
  DEFAULT_ONLINE_PAYMENT_METHOD,
  isCashPaymentMethod,
  isOfflinePaymentMethod,
  isOnlinePaymentMethod,
} from "@xua/shared/mappers/payment";

interface RetryOrderItem {
  product_name: string;
  qty?: number;
  unit_price_cents?: number;
  subtotal_cents?: number;
  image_url?: string | null;
}

interface RetryOrder {
  id: string;
  status: string;
  payment_status: string | null;
  subtotal_cents: number;
  total_cents: number;
  address_line?: string | null;
  address_details?: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
  } | null;
  items: RetryOrderItem[];
}

function canRetryPayment(order: RetryOrder): boolean {
  const paymentStatus = order.payment_status?.toLowerCase();
  const pendingPayment = !paymentStatus || paymentStatus === "pending";
  return pendingPayment && (order.status === "CREATED" || order.status === "PAYMENT_PENDING");
}

function isValidRedirectUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function formatOrderAddress(order: RetryOrder): string {
  if (order.address_line) return order.address_line;
  const a = order.address_details;
  if (!a) return "Endereço do pedido";
  return `${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ""} — ${a.neighborhood}, ${a.city}/${a.state}`;
}

function parseCurrencyInputToCents(value: string): number | null {
  const normalized = value.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

const WINDOW_LABEL: Record<string, string> = { morning: "Manhã (08h às 12h)", afternoon: "Tarde (13h às 18h)" };

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retryOrderId = searchParams.get("orderId");
  const isRetryMode = Boolean(retryOrderId);
  const mounted = useIsClient();

  const date = useCheckoutStore((s) => s.selectedDate);
  const deliveryWindow = useCheckoutStore((s) => s.selectedWindow) ?? "morning";
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);
  const instructions = useCheckoutStore((s) => s.instructions);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
  const setPaymentMethod = useCheckoutStore((s) => s.setPaymentMethod);
  const cashChangeForCents = useCheckoutStore((s) => s.cashChangeForCents);
  const setCashChangeForCents = useCheckoutStore((s) => s.setCashChangeForCents);
  const resetCheckout = useCheckoutStore((s) => s.resetCheckout);

  const items = useCartStore((s) => s.items);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const clearCart = useCartStore((s) => s.clearCart);

  const { address: selectedAddress, isLoading: addressLoading } = useSelectedAddress();

  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeInput, setChangeInput] = useState("");
  // Pedido criado: o carrinho é limpo, mas a tela já está saindo (não redirecionar para /cart).
  const [completed, setCompleted] = useState(false);

  // Pedido novo sem entrega definida volta para a etapa anterior.
  useEffect(() => {
    if (!mounted || isRetryMode || isRedirecting || loading || completed) return;
    if (items.length === 0) router.replace("/cart");
    else if (!selectedDistributorId || !date) router.replace("/checkout/schedule");
  }, [mounted, isRetryMode, isRedirecting, loading, completed, items.length, selectedDistributorId, date, router]);

  const retryQuery = useQuery({
    queryKey: ["order", retryOrderId, "retry"],
    queryFn: async () => (await api.get<{ order: RetryOrder }>(`/api/orders/${encodeURIComponent(retryOrderId!)}`)).order,
    enabled: isRetryMode && !isRedirecting,
  });
  const retryOrder = retryQuery.data ?? null;
  useEffect(() => {
    if (retryOrder && !canRetryPayment(retryOrder)) router.replace(`/orders/${encodeURIComponent(retryOrder.id)}`);
  }, [retryOrder, router]);

  // Nome da distribuidora para o resumo.
  const distributorQuery = useQuery({
    queryKey: ["distributors", selectedAddress?.zone_id],
    queryFn: () =>
      api.get<{ distributors: { id: string; name: string }[] }>(
        `/api/distributors?zone_id=${encodeURIComponent(selectedAddress!.zone_id!)}`,
      ),
    enabled: !isRetryMode && Boolean(selectedAddress?.zone_id),
    staleTime: 60_000,
  });
  const distributorName = distributorQuery.data?.distributors.find((d) => d.id === selectedDistributorId)?.name;

  useEffect(() => {
    if (isRetryMode && isCashPaymentMethod(paymentMethod)) setPaymentMethod(DEFAULT_ONLINE_PAYMENT_METHOD);
  }, [isRetryMode, paymentMethod, setPaymentMethod]);

  // Métodos disponíveis dependem da distribuidora (gateway/capacidade).
  const { methods: distributorMethods } = useDistributorPaymentMethods(selectedDistributorId);
  const hiddenPaymentMethods = useMemo(() => {
    const hidden = new Set(hiddenCheckoutMethods(distributorMethods));
    if (isRetryMode) {
      hidden.add(CASH_PAYMENT_METHOD);
      hidden.add(CARD_ON_DELIVERY_PAYMENT_METHOD);
    }
    return Array.from(hidden);
  }, [distributorMethods, isRetryMode]);

  useEffect(() => {
    if (!hiddenPaymentMethods.includes(paymentMethod)) return;
    const available = CHECKOUT_PAYMENT_METHOD_VALUES.filter((m) => !hiddenPaymentMethods.includes(m));
    if (available.length > 0) setPaymentMethod(available[0]);
  }, [hiddenPaymentMethods, paymentMethod, setPaymentMethod]);

  const subtotal = retryOrder ? retryOrder.subtotal_cents : mounted ? getSubtotalCents() : 0;
  const totalCents = retryOrder ? retryOrder.total_cents : subtotal;
  const displayItems = useMemo(
    () =>
      retryOrder
        ? retryOrder.items.map((item, index) => {
            const quantity = item.qty ?? 1;
            return {
              key: `${item.product_name}-${index}`,
              product_name: item.product_name,
              quantity,
              image_url: item.image_url ?? null,
              amount_cents: item.subtotal_cents ?? (item.unit_price_cents ?? 0) * quantity,
            };
          })
        : items.map((item) => ({
            key: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            image_url: item.image_url ?? null,
            amount_cents: item.unit_price_cents * item.quantity,
          })),
    [retryOrder, items],
  );

  const isCashPayment = isCashPaymentMethod(paymentMethod);
  const cashChangeInvalid = isCashPayment && cashChangeForCents != null && cashChangeForCents < totalCents;
  const retryError = retryQuery.error instanceof Error ? retryQuery.error.message : null;
  const confirmDisabled =
    !mounted ||
    loading ||
    (isRetryMode ? retryQuery.isLoading || !retryOrder : addressLoading || !selectedAddress) ||
    Boolean(retryError) ||
    (isRetryMode && isCashPayment) ||
    cashChangeInvalid;

  async function startCheckoutPayment(orderId: string): Promise<boolean> {
    if (!isOnlinePaymentMethod(paymentMethod)) {
      setError("Selecione Pix ou cartão para pagar online pelo Mercado Pago.");
      return false;
    }
    const paymentRes = await fetch("/api/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, payment_method: paymentMethod }),
    });
    const paymentBody = await paymentRes.json();
    if (!paymentRes.ok) {
      setError(paymentBody.error || "Erro ao iniciar pagamento");
      return false;
    }
    const redirectUrl = String(paymentBody.redirectUrl ?? "");
    if (!isValidRedirectUrl(redirectUrl)) {
      setError("O Mercado Pago não retornou um link de pagamento válido.");
      return false;
    }
    setIsRedirecting(true);
    window.location.href = redirectUrl;
    return true;
  }

  async function handleConfirm() {
    setError(null);
    if (isRetryMode) {
      if (!retryOrderId || !retryOrder) {
        setError("Não foi possível retomar o pagamento deste pedido.");
        return;
      }
      setLoading(true);
      try {
        await startCheckoutPayment(retryOrderId);
      } catch {
        setError("Erro de conexão. Tente novamente.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!selectedAddress) {
      setError("Selecione um endereço de entrega.");
      return;
    }
    if (!selectedDistributorId) {
      router.replace("/checkout/schedule");
      return;
    }
    if (cashChangeInvalid) {
      setError("O valor para troco deve ser maior ou igual ao total do pedido.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_id: selectedAddress.id,
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          delivery_date: date,
          delivery_window: deliveryWindow,
          ...(selectedSlotId ? { time_slot_id: selectedSlotId } : {}),
          ...(instructions.trim() ? { delivery_instructions: instructions.trim() } : {}),
          distributor_id: selectedDistributorId,
          payment_method: paymentMethod,
          ...(isCashPayment && cashChangeForCents != null ? { cash_change_for_cents: cashChangeForCents } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Erro ao criar pedido");
        return;
      }

      const { order } = await res.json();
      setCompleted(true);

      if (isOnlinePaymentMethod(paymentMethod)) {
        const started = await startCheckoutPayment(order.id);
        if (!started) return;
        clearCart();
        resetCheckout();
        return;
      }

      clearCart();
      resetCheckout();
      router.push(`/checkout/confirmation?orderId=${order.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (isRedirecting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
        <p className="font-medium text-muted-foreground">Abrindo o pagamento no Mercado Pago…</p>
      </div>
    );
  }

  const ctaLabel = isOfflinePaymentMethod(paymentMethod)
    ? "Confirmar pedido"
    : isRetryMode
      ? "Retomar pagamento"
      : "Pagar";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        back={isRetryMode ? true : "/checkout/schedule"}
        title={isRetryMode ? "Retomar pagamento" : "Pagamento"}
        description={isRetryMode ? "Conclua o pagamento deste pedido sem criar outro." : "Revise e escolha como pagar."}
      >
        {!isRetryMode ? <CheckoutProgress current={1} /> : null}
      </PageHeader>

      <div className="space-y-6 px-4 pt-2">
        {/* Resumo da entrega */}
        <Card className="flex flex-col gap-3 rounded-2xl border-hairline p-4">
          <div className="flex items-start gap-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {isRetryMode ? (
              retryQuery.isLoading ? <Skeleton className="h-4 w-48" /> : retryOrder ? <span>{formatOrderAddress(retryOrder)}</span> : null
            ) : addressLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : selectedAddress ? (
              <span>
                {selectedAddress.label ? <strong className="font-semibold">{selectedAddress.label} · </strong> : null}
                {formatAddressLine(selectedAddress)}
                <span className="block text-muted-foreground">
                  {selectedAddress.neighborhood} — {selectedAddress.city}/{selectedAddress.state}
                </span>
              </span>
            ) : null}
          </div>
          {!isRetryMode ? (
            <>
              <div className="flex items-center gap-3 text-sm">
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="first-letter:uppercase">
                  {date
                    ? isoDayToDate(date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
                    : "—"}{" "}
                  · {selectedSlotId ? (deliveryWindow === "afternoon" ? "Tarde" : "Manhã") : (WINDOW_LABEL[deliveryWindow] ?? deliveryWindow)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="size-4 shrink-0 text-primary" aria-hidden />
                <span>{distributorName ?? <Skeleton className="inline-block h-4 w-32 align-middle" />}</span>
              </div>
              <Button asChild variant="link" className="h-auto justify-start px-0 py-0">
                <Link href="/checkout/schedule">Alterar entrega</Link>
              </Button>
            </>
          ) : null}
        </Card>

        {/* Forma de pagamento */}
        <section aria-labelledby="sec-pagamento" className="space-y-3">
          <h2 id="sec-pagamento" className="text-sm font-semibold text-foreground">
            Como você quer pagar?
          </h2>
          <PaymentMethodSelector
            value={paymentMethod}
            onChange={(method) => {
              setPaymentMethod(method);
              if (!isCashPaymentMethod(method)) {
                setCashChangeForCents(null);
                setChangeInput("");
              }
            }}
            hiddenMethods={hiddenPaymentMethods}
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {isOfflinePaymentMethod(paymentMethod) ? (
              <>
                <Banknote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                O pedido vai para a distribuidora agora e o pagamento é feito ao entregador.
              </>
            ) : (
              <>
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Pix e cartão são concluídos no ambiente seguro do Mercado Pago.
              </>
            )}
          </p>
        </section>

        {/* Troco (dinheiro) */}
        {isCashPayment && !isRetryMode ? (
          <section aria-labelledby="sec-troco" className="space-y-3 rounded-2xl bg-secondary/60 p-4">
            <h2 id="sec-troco" className="text-sm font-semibold text-foreground">
              Vai precisar de troco?
            </h2>
            <ToggleGroup
              type="single"
              variant="outline"
              value={cashChangeForCents == null ? "exact" : "change"}
              onValueChange={(v) => {
                if (v === "exact") {
                  setCashChangeForCents(null);
                  setChangeInput("");
                } else if (v === "change") {
                  setCashChangeForCents(Math.max(cashChangeForCents ?? totalCents, totalCents));
                }
              }}
              className="grid w-full grid-cols-2"
            >
              <ToggleGroupItem value="exact" className="h-11 bg-card data-[state=on]:bg-cta data-[state=on]:text-cta-foreground">
                Valor exato
              </ToggleGroupItem>
              <ToggleGroupItem value="change" className="h-11 bg-card data-[state=on]:bg-cta data-[state=on]:text-cta-foreground">
                Preciso de troco
              </ToggleGroupItem>
            </ToggleGroup>
            {cashChangeForCents != null ? (
              <div className="grid gap-1.5">
                <Label htmlFor="troco">Troco para quanto?</Label>
                <Input
                  id="troco"
                  inputMode="decimal"
                  placeholder={`Ex.: ${formatCurrency(Math.ceil(totalCents / 5000) * 5000)}`}
                  value={changeInput}
                  onChange={(e) => {
                    setChangeInput(e.target.value);
                    const cents = parseCurrencyInputToCents(e.target.value);
                    setCashChangeForCents(cents ?? totalCents);
                  }}
                  aria-invalid={cashChangeInvalid || undefined}
                  className="h-11 bg-card text-base"
                />
                {cashChangeInvalid ? (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    Informe um valor maior ou igual a {formatCurrency(totalCents)}.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Troco estimado: {formatCurrency(Math.max(cashChangeForCents - totalCents, 0))}
                  </p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Resumo dos itens */}
        <section aria-labelledby="sec-itens" className="space-y-3">
          <h2 id="sec-itens" className="text-sm font-semibold text-foreground">
            Resumo do pedido
          </h2>
          <Card className="flex flex-col gap-3 rounded-2xl border-hairline p-4">
            {mounted
              ? displayItems.map((item) => {
                  const imageUrl = getRenderableProductImageUrl(item.image_url);
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60">
                        {imageUrl ? (
                          <Image src={imageUrl} alt="" width={48} height={48} className="size-full object-cover" />
                        ) : (
                          <Droplets className="size-5 text-sky" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{plural(item.quantity, "unidade", "unidades")}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(item.amount_cents)}</p>
                    </div>
                  );
                })
              : null}
            <Separator />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="font-heading text-xl font-bold text-primary tabular-nums">
                {mounted ? formatCurrency(totalCents) : "—"}
              </span>
            </div>
          </Card>
        </section>

        {/* Vasilhame: aviso + norma, uma vez só */}
        {!isRetryMode && mounted ? (
          <div className="space-y-2">
            <BottleExchangeNotice items={items} />
            <Accordion type="single" collapsible className="rounded-2xl border border-hairline px-4">
              <AccordionItem value="abnt" className="border-0">
                <AccordionTrigger className="text-sm">Validade dos garrafões retornáveis</AccordionTrigger>
                <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
                  Conforme a ABNT NBR 14222 e a Portaria DNPM nº 387/2008, os garrafões retornáveis têm vida útil máxima de
                  3 (três) anos a partir da data de fabricação.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : null}

        {error || retryError ? (
          <Alert variant="destructive">
            <AlertDescription>{error ?? retryError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <StickyActionBar
        summary={
          <span className="block text-center text-xs">
            Ao confirmar, você concorda com os termos de uso e a política de embalagens retornáveis.
          </span>
        }
      >
        <Button variant="cta" size="xl" className={cn("justify-between")} disabled={confirmDisabled} onClick={handleConfirm}>
          {loading ? (
            <span className="flex w-full items-center justify-center gap-2">
              <Loader2 className="animate-spin" aria-hidden /> Processando…
            </span>
          ) : (
            <>
              <span>{ctaLabel}</span>
              <span className="tabular-nums">{mounted ? formatCurrency(totalCents) : "—"}</span>
            </>
          )}
        </Button>
      </StickyActionBar>
    </div>
  );
}

export default function CheckoutPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Carregando" />
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
