"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useCartStore } from "@/src/store/cart";
import { useAuthStore } from "@/src/store/auth";
import { useCheckoutStore } from "@/src/store/checkout";
import { formatCurrency } from "@/src/lib/utils";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";
import { Button } from "@/src/components/ui/button";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import type { Address } from "@/src/types";
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  Zap,
  ShieldCheck,
  Banknote,
  Info,
  FlaskConical,
} from "lucide-react";
import { PaymentMethodSelector } from "@/src/components/consumer/payment-method-selector";
import {
  useDistributorPaymentMethods,
  hiddenCheckoutMethods,
} from "@/src/hooks/use-distributor-payment-methods";
import { CHECKOUT_PAYMENT_METHOD_VALUES } from "@xua/shared/enums";
import {
  CARD_ON_DELIVERY_PAYMENT_METHOD,
  CASH_PAYMENT_METHOD,
  DEFAULT_ONLINE_PAYMENT_METHOD,
  isCashPaymentMethod,
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
  deposit_cents: number;
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
  return (
    pendingPayment &&
    (order.status === "CREATED" || order.status === "PAYMENT_PENDING")
  );
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatOrderAddress(order: RetryOrder): string {
  if (order.address_line) return order.address_line;
  const address = order.address_details;
  if (!address) return "Endereço do pedido";
  const complement = address.complement ? ` — ${address.complement}` : "";
  return `${address.street}, ${address.number}${complement} — ${address.neighborhood}, ${address.city}/${address.state}`;
}

function parseCurrencyInputToCents(value: string): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retryOrderId = searchParams.get("orderId");
  const isRetryMode = Boolean(retryOrderId);
  const user = useAuthStore((s) => s.user);

  // Read schedule data from persisted checkout store
  const date = useCheckoutStore((s) => s.selectedDate);
  const deliveryWindow = useCheckoutStore((s) => s.selectedWindow) ?? "morning";
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);
  const storedAddressId = useCheckoutStore((s) => s.selectedAddressId);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
  const setPaymentMethod = useCheckoutStore((s) => s.setPaymentMethod);
  const cashChangeForCents = useCheckoutStore((s) => s.cashChangeForCents);
  const setCashChangeForCents = useCheckoutStore((s) => s.setCashChangeForCents);
  const resetCheckout = useCheckoutStore((s) => s.resetCheckout);

  const items = useCartStore((s) => s.items);
  const emptyBottlesQty = useCartStore((s) => s.emptyBottlesQty);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const clearCart = useCartStore((s) => s.clearCart);

  // mounted evita hydration mismatch: Zustand persist lê localStorage só no client
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(!isRetryMode);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [retryOrder, setRetryOrder] = useState<RetryOrder | null>(null);
  const [retryLoading, setRetryLoading] = useState(isRetryMode);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [depositPreview, setDepositPreview] = useState({
    isFirstPurchase: false,
    depositAmountCents: 0,
  });

  // Address
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addressLoading, setAddressLoading] = useState(!isRetryMode);

  // Keep store in sync when user changes address in payment page
  const setSelectedAddressId = useCheckoutStore((s) => s.setSelectedAddressId);
  const handleAddressSelect = useCallback(
    (addr: Address) => {
      setSelectedAddress(addr);
      setSelectedAddressId(addr.id);
    },
    [setSelectedAddressId],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isRetryMode && isCashPaymentMethod(paymentMethod)) {
      setPaymentMethod(DEFAULT_ONLINE_PAYMENT_METHOD);
    }
  }, [isRetryMode, paymentMethod, setPaymentMethod]);

  // Métodos disponíveis dependem da distribuidora escolhida (gateway/capacidade).
  const { methods: distributorMethods } = useDistributorPaymentMethods(selectedDistributorId);
  const hiddenPaymentMethods = useMemo(() => {
    const hidden = new Set(hiddenCheckoutMethods(distributorMethods));
    if (isRetryMode) {
      hidden.add(CASH_PAYMENT_METHOD);
      hidden.add(CARD_ON_DELIVERY_PAYMENT_METHOD);
    }
    return Array.from(hidden);
  }, [distributorMethods, isRetryMode]);

  // Se o método selecionado ficou indisponível, troca para o primeiro válido.
  useEffect(() => {
    if (!hiddenPaymentMethods.includes(paymentMethod)) return;
    const available = CHECKOUT_PAYMENT_METHOD_VALUES.filter(
      (m) => !hiddenPaymentMethods.includes(m),
    );
    if (available.length > 0) setPaymentMethod(available[0]);
  }, [hiddenPaymentMethods, paymentMethod, setPaymentMethod]);

  const subtotal = retryOrder ? retryOrder.subtotal_cents : mounted ? getSubtotalCents() : 0;
  const depositCents = retryOrder
    ? retryOrder.deposit_cents
    : depositPreview.isFirstPurchase
    ? depositPreview.depositAmountCents
    : 0;
  const totalCents = retryOrder ? retryOrder.total_cents : subtotal + depositCents;
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
  const paymentMethodUnavailable = isRetryMode && isCashPayment;
  const cashChangeInvalid =
    isCashPayment && cashChangeForCents != null && cashChangeForCents < totalCents;
  const confirmDisabled =
    !mounted ||
    loading ||
    previewLoading ||
    retryLoading ||
    !!previewError ||
    !!retryError ||
    paymentMethodUnavailable ||
    cashChangeInvalid ||
    (isRetryMode ? !retryOrder : !selectedAddress);

  // Load deposit preview + addresses
  useEffect(() => {
    if (isRetryMode || isRedirecting) {
      setPreviewLoading(false);
      setAddressLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        let consumerId = user?.id;

        if (!consumerId) {
          const meRes = await fetch("/api/auth/me");
          if (!meRes.ok) throw new Error("AUTH_REQUIRED");
          const meBody = await meRes.json();
          consumerId = meBody.consumer?.id;
        }

        if (!consumerId) throw new Error("AUTH_REQUIRED");

        const [depositRes, addrRes] = await Promise.all([
          fetch(`/api/consumers/${consumerId}/deposit-preview`),
          fetch(`/api/consumers/${consumerId}/addresses`),
        ]);
        const depositBody = await depositRes.json();
        const addrBody = await addrRes.json();

        if (!depositRes.ok) {
          throw new Error(depositBody.error || "Erro ao carregar caução");
        }

        if (!cancelled) {
          setDepositPreview({
            isFirstPurchase: Boolean(depositBody.isFirstPurchase),
            depositAmountCents: Number(depositBody.depositAmountCents ?? 0),
          });

          const addrList: Address[] = addrBody.addresses ?? [];
          // Try to use address from schedule params, then default, then first
          const fromParams = storedAddressId
            ? addrList.find((a) => a.id === storedAddressId)
            : null;
          const def =
            fromParams ??
            addrList.find((a) => a.is_default) ??
            addrList[0] ??
            null;
          setSelectedAddress(def);
        }
      } catch {
        if (!cancelled) {
          setPreviewError("Não foi possível carregar os dados da compra.");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
          setAddressLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [isRetryMode, user?.id, storedAddressId, isRedirecting]);

  useEffect(() => {
    if (isRedirecting) return;
    if (!retryOrderId) {
      setRetryOrder(null);
      setRetryLoading(false);
      setRetryError(null);
      return;
    }

    let cancelled = false;
    const orderId = retryOrderId;
    async function loadRetryOrder() {
      setRetryLoading(true);
      setRetryError(null);
      try {
        const encodedOrderId = encodeURIComponent(orderId);
        const res = await fetch(`/api/orders/${encodedOrderId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Erro ao carregar pedido");
        const order = body.order as RetryOrder | undefined;
        if (!order) throw new Error("Pedido não encontrado");
        if (!canRetryPayment(order)) {
          router.replace(`/orders/${encodedOrderId}`);
          return;
        }
        if (!cancelled) setRetryOrder(order);
      } catch (err) {
        if (!cancelled) {
          setRetryOrder(null);
          setRetryError(err instanceof Error ? err.message : "Não foi possível carregar o pedido.");
        }
      } finally {
        if (!cancelled) setRetryLoading(false);
      }
    }

    void loadRetryOrder();
    return () => {
      cancelled = true;
    };
  }, [retryOrderId, router, isRedirecting]);

  async function startCheckoutPayment(orderId: string): Promise<boolean> {
    if (!isOnlinePaymentMethod(paymentMethod)) {
      setError("Selecione Pix ou cartão para pagar online pelo Mercado Pago.");
      return false;
    }

    const paymentRes = await fetch("/api/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        payment_method: paymentMethod,
      }),
    });

    const paymentBody = await paymentRes.json();
    if (!paymentRes.ok) {
      setError(paymentBody.error || "Erro ao iniciar pagamento");
      return false;
    }

    const redirectUrl = String(paymentBody.redirectUrl ?? "");
    if (!isValidRedirectUrl(redirectUrl)) {
      setError("Gateway não retornou o link de pagamento válido.");
      return false;
    }

    setIsRedirecting(true);
    window.location.href = redirectUrl;
    return true;
  }

  async function handleConfirm() {
    if (isRetryMode) {
      if (!retryOrderId || !retryOrder) {
        setError("Não foi possível retomar o pagamento deste pedido.");
        return;
      }
      setLoading(true);
      setError(null);
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
    if (cashChangeInvalid) {
      setError("O valor para troco deve ser maior ou igual ao total do pedido.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_id: selectedAddress.id,
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
          })),
          empty_bottles_qty: emptyBottlesQty,
          delivery_date: date,
          delivery_window: deliveryWindow,
          ...(selectedSlotId ? { time_slot_id: selectedSlotId } : {}),
          ...(selectedDistributorId ? { distributor_id: selectedDistributorId } : {}),
          payment_method: paymentMethod,
          ...(isCashPayment && cashChangeForCents != null
            ? { cash_change_for_cents: cashChangeForCents }
            : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao criar pedido");
        return;
      }

      const { order } = await res.json();

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
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 px-4 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <p className="text-muted-foreground font-medium">Redirecionando para o Mercado Pago...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-primary-hover/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-primary" />
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-primary font-heading">
          Xuá
        </h1>
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-semibold text-[#32466e] uppercase tracking-wider">
            Secure Checkout
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 pt-4 pb-6 space-y-6">
        {/* Section Title */}
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold font-heading tracking-tight text-[#191c1d]">
            Finalize seu pedido
          </h2>
          <p className="text-sm text-[#434656]">
            {isRetryMode
              ? "Retome o pagamento deste pedido sem criar uma nova compra."
              : "Confirme os detalhes abaixo para receber sua água mineral."}
          </p>
        </div>

        {/* Delivery Address */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-lg text-[#191c1d]">
              Endereço de Entrega
            </h3>
            {!isRetryMode && (
              <button
                type="button"
                onClick={() => setAddressSheetOpen(true)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Alterar
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={isRetryMode}
            onClick={() => setAddressSheetOpen(true)}
            className="w-full flex gap-4 items-start rounded-xl bg-[#f3f4f5] p-5 text-left transition-all active:scale-[0.98] hover:bg-[#e7e8e9] disabled:cursor-default disabled:hover:bg-[#f3f4f5] disabled:active:scale-100"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#d8e2ff]">
              <MapPin className="h-5 w-5 text-[#32466e]" />
            </div>
            {retryLoading ? (
              <div className="flex-1 space-y-2 animate-pulse">
                <div className="h-4 w-40 rounded bg-[#e1e3e4]" />
                <div className="h-3 w-56 rounded bg-[#e1e3e4]" />
              </div>
            ) : retryOrder ? (
              <div className="min-w-0">
                <p className="font-bold text-[#191c1d]">Endereço do pedido</p>
                <p className="text-sm text-[#434656]">{formatOrderAddress(retryOrder)}</p>
              </div>
            ) : addressLoading ? (
              <div className="flex-1 space-y-2 animate-pulse">
                <div className="h-4 w-32 rounded bg-[#e1e3e4]" />
                <div className="h-3 w-48 rounded bg-[#e1e3e4]" />
              </div>
            ) : selectedAddress ? (
              <div className="min-w-0">
                <p className="font-bold text-[#191c1d]">
                  {selectedAddress.label || "Endereço"}
                </p>
                <p className="text-sm text-[#434656]">
                  {selectedAddress.street}, {selectedAddress.number}
                  {selectedAddress.complement
                    ? ` — ${selectedAddress.complement}`
                    : ""}
                </p>
                <p className="text-sm text-[#434656]">
                  {selectedAddress.neighborhood} — {selectedAddress.city}/
                  {selectedAddress.state}
                </p>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="font-bold text-primary">
                  Selecionar endereço
                </p>
                <p className="text-sm text-[#434656]">
                  Toque para adicionar
                </p>
              </div>
            )}
          </button>
        </section>

        {/* Payment Methods */}
        <section className="space-y-3">
          <h3 className="font-heading font-bold text-lg text-[#191c1d]">
            Forma de Pagamento
          </h3>
          <PaymentMethodSelector
            value={paymentMethod}
            onChange={(method) => {
              setPaymentMethod(method);
              if (!isCashPaymentMethod(method)) setCashChangeForCents(null);
            }}
            hiddenMethods={hiddenPaymentMethods}
          />
          {isRetryMode && (
            <p className="text-xs text-[#434656]">
              Retomada disponível para Pix e cartão pelo Mercado Pago.
            </p>
          )}
        </section>

        {isCashPayment && !isRetryMode && (
          <section className="space-y-3 rounded-xl border border-[#c9d9ff] bg-[#eaf1ff] p-4">
            <div className="flex items-start gap-3">
              <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-[#32466e]" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#1f3f75]">Troco</p>
                <p className="mt-0.5 text-xs text-[#32528a]">
                  Total do pedido: {formatCurrency(totalCents)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCashChangeForCents(null)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                  cashChangeForCents == null
                    ? "bg-[#00E0FF] text-[#001735]"
                    : "bg-white text-[#32466e] ring-1 ring-[#c9d9ff]"
                }`}
              >
                Valor exato
              </button>
              <button
                type="button"
                onClick={() => setCashChangeForCents(Math.max(cashChangeForCents ?? totalCents, totalCents))}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                  cashChangeForCents != null
                    ? "bg-[#00E0FF] text-[#001735]"
                    : "bg-white text-[#32466e] ring-1 ring-[#c9d9ff]"
                }`}
              >
                Preciso de troco
              </button>
            </div>

            {cashChangeForCents != null && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#32528a]">
                  Troco para
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={(cashChangeForCents / 100).toFixed(2).replace(".", ",")}
                  onChange={(event) => setCashChangeForCents(parseCurrencyInputToCents(event.target.value))}
                  className="h-12 w-full rounded-xl border border-[#c9d9ff] bg-white px-4 text-base font-bold text-[#191c1d] outline-none focus:border-[#00E0FF]"
                  placeholder={formatCurrency(totalCents)}
                />
                {cashChangeInvalid ? (
                  <p className="text-xs font-semibold text-red-700">
                    Informe um valor maior ou igual a {formatCurrency(totalCents)}.
                  </p>
                ) : (
                  <p className="text-xs text-[#32528a]">
                    Troco estimado: {formatCurrency(Math.max(cashChangeForCents - totalCents, 0))}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Payment provider banner */}
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${isCashPayment ? "bg-[#eaf1ff] border-[#c9d9ff]" : "bg-[#e7f9f2] border-[#b7ead6]"}`}>
          {isCashPayment ? (
            <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#32466e]" />
          ) : (
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#008d5d]" />
          )}
          <div>
            <p className={`text-sm font-bold ${isCashPayment ? "text-[#1f3f75]" : "text-[#00573d]"}`}>
              {isCashPayment ? "Pagamento em dinheiro na entrega" : "Pagamento online via Mercado Pago"}
            </p>
            <p className={`mt-0.5 text-xs ${isCashPayment ? "text-[#32528a]" : "text-[#006c49]"}`}>
              {isCashPayment
                ? "O pedido será enviado para a distribuidora agora e o motorista cobrará o valor na entrega."
                : "Pix e cartão são finalizados no ambiente seguro do Mercado Pago. O pedido avança após a confirmação do gateway."}
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_8px_24px_rgba(0,26,64,0.06)]">
          <h3 className="font-heading font-bold text-lg text-[#191c1d] mb-5">
            Resumo do Pedido
          </h3>

          {/* Items */}
          <div className="space-y-4">
            {mounted &&
              displayItems.map((item) => {
                const imageUrl = getRenderableProductImageUrl(item.image_url);
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-4"
                  >
                    <div className="h-16 w-16 shrink-0 rounded-lg bg-[#f8f9fa] overflow-hidden flex items-center justify-center">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={item.product_name}
                          width={64}
                          height={64}
                          className="object-cover h-full w-full"
                        />
                      ) : (
                        <div className="h-full w-full bg-[#e1e3e4] flex items-center justify-center">
                          <Banknote className="h-6 w-6 text-[#737688]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#191c1d]">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-[#434656]">
                        {item.quantity}{" "}
                        {item.quantity === 1 ? "Unidade" : "Unidades"}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-[#191c1d]">
                      {formatCurrency(item.amount_cents)}
                    </p>
                  </div>
                );
              })}
          </div>

          <hr className="my-4 border-0 h-px bg-[#c3c5d9]/15" />

          {/* Totals */}
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-[#434656]">Subtotal</span>
              <span className="text-[#191c1d]">
                {mounted ? formatCurrency(subtotal) : "—"}
              </span>
            </div>
            {!previewLoading && depositCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-700">Caução da 1ª compra</span>
                <span className="text-amber-700 font-semibold">
                  {formatCurrency(depositCents)}
                </span>
              </div>
            )}
            {previewLoading && (
              <div className="flex justify-between text-sm text-[#434656]">
                <span>Caução</span>
                <span>Calculando...</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold pt-3 border-t border-[#e1e3e4]">
              <span className="text-[#191c1d]">Total</span>
              <span className="text-primary">
                {mounted ? formatCurrency(totalCents) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div className="rounded-xl bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
            {error}
          </div>
        )}
        {previewError && (
          <div className="rounded-xl bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
            {previewError}
          </div>
        )}
        {retryError && (
          <div className="rounded-xl bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
            {retryError}
          </div>
        )}

        {/* CTA Button */}
        <Button
          className="w-full h-14 rounded-xl bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] font-bold text-lg shadow-lg hover:shadow-[#00E0FF]/20 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50"
          disabled={confirmDisabled}
          onClick={handleConfirm}
        >
          {loading
            ? "Processando..."
            : mounted
              ? `${isCashPayment ? "Confirmar pedido" : isRetryMode ? "Retomar pagamento" : "Finalizar pagamento"} de ${formatCurrency(totalCents)}`
              : "Carregando..."}
          {!loading && <ChevronRight className="h-5 w-5 ml-1" />}
        </Button>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#434656] uppercase tracking-widest font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          Pagamento 100% Seguro
        </div>

        {/* ABNT Notice */}
        <div className="rounded-xl bg-[#fff8e6] p-4 border border-[#ffe099]">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 shrink-0 text-[#b37400] mt-0.5" />
            <p className="text-xs text-[#805300] leading-relaxed font-medium">
              <strong>Atenção:</strong> Conforme a ABNT NBR 14222 e a Portaria DNPM nº 387/2008, os garrafões retornáveis devem possuir prazo máximo de 3 (três) anos de vida útil, contados a partir da data de fabricação.
            </p>
          </div>
        </div>

        {/* Legal notice */}
        <div className="rounded-xl bg-[#d8e2ff]/30 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <p className="text-xs text-[#32466e] leading-relaxed">
              Ao finalizar este pedido, você concorda com nossos termos de uso e
              política de devolução de embalagens retornáveis.
            </p>
          </div>
        </div>
      </div>

      {/* Address Selection Sheet */}
      <AddressSheet
        open={addressSheetOpen}
        onOpenChange={setAddressSheetOpen}
        selectedAddressId={selectedAddress?.id ?? null}
        onSelect={handleAddressSelect}
      />
    </div>
  );
}

export default function CheckoutPaymentPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center px-4"><p className="text-muted-foreground">Carregando...</p></div>}>
      <PaymentContent />
    </Suspense>
  );
}
