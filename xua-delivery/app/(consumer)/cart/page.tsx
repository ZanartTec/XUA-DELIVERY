"use client";

import Link from "next/link";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const emptyBottlesQty = useCartStore((s) => s.emptyBottlesQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const setEmptyBottles = useCartStore((s) => s.setEmptyBottles);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);

  const subtotal = getSubtotalCents();
  const isEmpty = items.length === 0;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Carrinho</h1>

      {isEmpty ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Seu carrinho está vazio.</p>
          <Link href="/catalog" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            Ver catálogo
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.product_id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(item.unit_price_cents)} un.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        item.quantity <= 1
                          ? removeItem(item.product_id)
                          : updateQty(item.product_id, item.quantity - 1)
                      }
                    >
                      −
                    </Button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQty(item.product_id, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Garrafões vazios para troca</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="number"
                min={0}
                value={emptyBottlesQty}
                onChange={(e) => setEmptyBottles(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24"
              />
              <p className="text-xs text-gray-400 mt-1">
                Informe quantos garrafões vazios você tem para devolver.
              </p>
              {emptyBottlesQty === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Primeira compra? Será cobrada caução de R$ 30 por garrafão.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-lg font-semibold">
              Subtotal: {formatCurrency(subtotal)}
            </span>
            <Link href="/checkout/schedule">
              <Button>Continuar</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
