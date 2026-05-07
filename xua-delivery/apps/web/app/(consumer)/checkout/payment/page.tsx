"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCartStore } from "@/src/store/cart";
import { useAuthStore } from "@/src/store/auth";
import { useCheckoutStore } from "@/src/store/checkout";
import { formatCurrency } from "@/src/lib/utils";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import type { Address } from "@/src/types";
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  Zap,
  ShieldCheck,
  CreditCard,
  Banknote,
  WalletCards,
  Tag,
  Info,
  FlaskConical,
  Check,
} from "lucide-react";

type PaymentMethod = "pix" | "credit" | "cash";

const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  sublabel: string;
  icon: typeof CreditCard;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    value: "pix",
    label: "Pix",
    sublabel: "Aprovação instantânea e segura",
    icon: Banknote,
    iconBg: "bg-[#e7f9f2]",
    iconColor: "text-[#008d5d]",
  },
  {
    value: "credit",
    label: "Cartão de Crédito",
    sublabel: "Em breve via Mercado Pago",
    icon: CreditCard,
    iconBg: "bg-[#d8e2ff]",
    iconColor: "text-[#32466e]",
  },
  {
    value: "cash",
    label: "Dinheiro",
    sublabel: "Pague na hora da entrega",
    icon: WalletCards,
    iconBg: "bg-[#e1e3e4]",
    iconColor: "text-[#434656]",
  },
];

function PaymentContent() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Read schedule data from persisted checkout store
  const date = useCheckoutStore((s) => s.selectedDate);
  const deliveryWindow = useCheckoutStore((s) => s.selectedWindow) ?? "morning";
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);
  const storedAddressId = useCheckoutStore((s) => s.selectedAddressId);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
  const setPaymentMethod = useCheckoutStore((s) => s.setPaymentMethod);
  const resetCheckout = useCheckoutStore((s) => s.resetCheckout);

  const items = useCartStore((s) => s.items);
  const emptyBottlesQty = useCartStore((s) => s.emptyBottlesQty);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const clearCart = useCartStore((s) => s.clearCart);

  // mounted evita hydration mismatch: Zustand persist lê localStorage só no client
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [depositPreview, setDepositPreview] = useState({
    isFirstPurchase: false,
    depositAmountCents: 0,
  });

  // Address
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);

  // Keep store in sync when user changes address in payment page
  const setSelectedAddressId = useCheckoutStore((s) => s.setSelectedAddressId);
  function handleAddressSelect(addr: Address) {
    setSelectedAddress(addr);
    setSelectedAddressId(addr.id);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  const subtotal = mounted ? getSubtotalCents() : 0;
  const deliveryFeeCents = 500;
  const depositCents = depositPreview.isFirstPurchase
    ? depositPreview.depositAmountCents
    : 0;
  const totalCents = subtotal + deliveryFeeCents + depositCents;

  // Load deposit preview + addresses
  useEffect(() => {
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
  }, [user?.id, storedAddressId]);

  async function handleConfirm() {
    if (!selectedAddress) {
      setError("Selecione um endereço de entrega.");
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
          // Mercado Pago: será usado quando integrar
          payment_method: paymentMethod,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao criar pedido");
        return;
      }

      const { order } = await res.json();
      clearCart();
      resetCheckout();
      router.push(`/checkout/confirmation?orderId=${order.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const windowLabels: Record<string, string> = {
    morning: "Manhã",
    afternoon: "Tarde",
    evening: "Noite",
  };

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
            Confirme os detalhes abaixo para receber sua água mineral.
          </p>
        </div>

        {/* Delivery Address */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-lg text-[#191c1d]">
              Endereço de Entrega
            </h3>
            <button
              type="button"
              onClick={() => setAddressSheetOpen(true)}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Alterar
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAddressSheetOpen(true)}
            className="w-full flex gap-4 items-start rounded-xl bg-[#f3f4f5] p-5 text-left transition-all active:scale-[0.98] hover:bg-[#e7e8e9]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#d8e2ff]">
              <MapPin className="h-5 w-5 text-[#32466e]" />
            </div>
            {addressLoading ? (
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
          <div className="space-y-3">
            {PAYMENT_METHODS.map((pm) => {
              const selected = paymentMethod === pm.value;
              const Icon = pm.icon;
              const disabled = pm.value === "credit"; // credit card disabled until Mercado Pago
              return (
                <button
                  key={pm.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPaymentMethod(pm.value)}
                  className={cn(
                    "relative flex w-full items-center gap-4 rounded-xl p-4 transition-all active:scale-[0.98]",
                    selected
                      ? "bg-white border-2 border-primary shadow-[0_2px_12px_rgba(27,74,154,0.08)]"
                      : "bg-white border border-[#e1e3e4] hover:bg-[#e7e8e9]",
                    disabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      pm.iconBg,
                    )}
                  >
                    <Icon className={cn("h-5 w-5", pm.iconColor)} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-[#191c1d]">{pm.label}</p>
                    <p className="text-xs text-[#434656]">{pm.sublabel}</p>
                  </div>
                  {selected && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C8F708]">
                      <Check className="h-3.5 w-3.5 text-[#1a2600]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Test mode banner */}
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 border border-amber-200/50">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              Modo de teste — pagamento simulado
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Nenhuma cobrança real será efetuada. O pedido será criado e
              confirmado automaticamente simulando a aprovação do gateway PIX.
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
              items.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center gap-4"
                >
                  <div className="h-16 w-16 shrink-0 rounded-lg bg-[#f8f9fa] overflow-hidden flex items-center justify-center">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
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
                    {formatCurrency(item.unit_price_cents * item.quantity)}
                  </p>
                </div>
              ))}
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
            <div className="flex justify-between text-sm">
              <span className="text-[#434656]">Taxa de entrega</span>
              <span className="text-[#191c1d]">
                {formatCurrency(deliveryFeeCents)}
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

        {/* CTA Button */}
        <Button
          className="w-full h-14 rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-bold text-lg shadow-lg hover:shadow-[#C8F708]/20 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50"
          disabled={
            !mounted || loading || previewLoading || !!previewError || !selectedAddress
          }
          onClick={handleConfirm}
        >
          {loading
            ? "Processando..."
            : mounted
              ? `Simular pagamento de ${formatCurrency(totalCents)}`
              : "Carregando..."}
          {!loading && <ChevronRight className="h-5 w-5 ml-1" />}
        </Button>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#434656] uppercase tracking-widest font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          Pagamento 100% Seguro
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
  return <PaymentContent />;
}
