"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

export default function CheckoutPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");
  const window = searchParams.get("window");

  const items = useCartStore((s) => s.items);
  const emptyBottlesQty = useCartStore((s) => s.emptyBottlesQty);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const clearCart = useCartStore((s) => s.clearCart);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = getSubtotalCents();
  const depositItems = items.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0);
  const depositCents = Math.max(0, depositItems - emptyBottlesQty) * 3000;
  const totalCents = subtotal + depositCents;

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
          })),
          empty_bottles_qty: emptyBottlesQty,
          delivery_date: date,
          delivery_window: window,
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
      <h1 className="text-xl font-bold">Pagamento</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Resumo do pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {items.map((item) => (
            <div key={item.product_id} className="flex justify-between">
              <span>
                {item.product_name} x{item.quantity}
              </span>
              <span>{formatCurrency(item.unit_price_cents * item.quantity)}</span>
            </div>
          ))}
          {depositCents > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>Caução ({depositItems - emptyBottlesQty} garrafões)</span>
              <span>{formatCurrency(depositCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>Total</span>
            <span>{formatCurrency(totalCents)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Entrega: {date} — {window === "morning" ? "Manhã" : "Tarde"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Forma de pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Integração com gateway de pagamento (placeholder).
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" disabled={loading} onClick={handleConfirm}>
        {loading ? "Processando..." : `Pagar ${formatCurrency(totalCents)}`}
      </Button>
    </div>
  );
}
