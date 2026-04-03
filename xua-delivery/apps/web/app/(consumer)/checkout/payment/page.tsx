"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCartStore } from "@/src/store/cart";
import { useAuthStore } from "@/src/store/auth";
import { formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { FlaskConical } from "lucide-react";

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const date = searchParams.get("date");
  // Normaliza para minúsculo — suporta URLs antigas com "MORNING"/"AFTERNOON"
  const deliveryWindow = (searchParams.get("window") ?? "morning").toLowerCase() as "morning" | "afternoon";

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
  const [addresses, setAddresses] = useState<{ id: string; street: string; number: string; is_default?: boolean }[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const subtotal = mounted ? getSubtotalCents() : 0;
  const depositCents = depositPreview.isFirstPurchase ? depositPreview.depositAmountCents : 0;
  const totalCents = subtotal + depositCents;

  useEffect(() => {
    let cancelled = false;

    async function loadDepositPreview() {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        let consumerId = user?.id;

        if (!consumerId) {
          const meRes = await fetch("/api/auth/me");
          if (!meRes.ok) {
            throw new Error("AUTH_REQUIRED");
          }

          const meBody = await meRes.json();
          consumerId = meBody.consumer?.id;
        }

        if (!consumerId) {
          throw new Error("AUTH_REQUIRED");
        }

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

          const addrList = addrBody.addresses ?? [];
          setAddresses(addrList);
          const defaultAddr = addrList.find((a: { is_default?: boolean }) => a.is_default) ?? addrList[0];
          if (defaultAddr) setSelectedAddressId(defaultAddr.id);
        }
      } catch {
        if (!cancelled) {
          setPreviewError("Não foi possível carregar a caução da compra.");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    void loadDepositPreview();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleConfirm() {
    if (!selectedAddressId) {
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
          address_id: selectedAddressId,
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
          })),
          empty_bottles_qty: emptyBottlesQty,
          delivery_date: date,
          delivery_window: deliveryWindow,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao criar pedido");
        return;
      }

      const { order } = await res.json();
      clearCart();
      router.push(`/checkout/confirmation?orderId=${order.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-foreground">Pagamento</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Resumo do pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {mounted && items.map((item) => (
            <div key={item.product_id} className="flex justify-between">
              <span>
                {item.product_name} x{item.quantity}
              </span>
              <span>{formatCurrency(item.unit_price_cents * item.quantity)}</span>
            </div>
          ))}
          {previewLoading && (
            <div className="flex justify-between text-muted-foreground">
              <span>Caução</span>
              <span>Calculando...</span>
            </div>
          )}
          {!previewLoading && depositCents > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>Caução da 1ª compra</span>
              <span>{formatCurrency(depositCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>Total</span>
            <span className="text-accent">{formatCurrency(totalCents)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Entrega: {date} — {deliveryWindow === "morning" ? "Manhã" : "Tarde"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Endereço de entrega</CardTitle>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum endereço cadastrado. Adicione um em Perfil &gt; Endereços.
            </p>
          ) : (
            <select
              value={selectedAddressId ?? ""}
              onChange={(e) => setSelectedAddressId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {addresses.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.street}, {addr.number}{addr.is_default ? " (Principal)" : ""}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {/* Banner de modo de teste */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
        <FlaskConical className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold">Modo de teste — pagamento simulado</p>
          <p className="text-xs mt-0.5 text-amber-700">
            Nenhuma cobrança real será efetuada. O pedido será criado e confirmado automaticamente
            simulando a aprovação do gateway PIX.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
          {error}
        </div>
      )}

      {previewError && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
          {previewError}
        </div>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        disabled={!mounted || loading || previewLoading || !!previewError}
        onClick={handleConfirm}
      >
        {loading ? "Processando..." : mounted ? `Simular pagamento de ${formatCurrency(totalCents)}` : "Carregando..."}
      </Button>
    </div>
  );
}

export default function CheckoutPaymentPage() {
  return (
    <Suspense fallback={<div className="p-4 flex items-center justify-center min-h-[40vh]"><p className="text-muted-foreground">Carregando...</p></div>}>
      <PaymentContent />
    </Suspense>
  );
}
