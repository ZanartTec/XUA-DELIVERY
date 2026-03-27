"use client";

import Link from "next/link";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Droplets } from "lucide-react";

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
      <h1 className="text-xl font-bold text-foreground">Carrinho</h1>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingCart className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-2">Seu carrinho está vazio.</p>
          <Link href="/catalog">
            <Button variant="outline" size="sm">
              <Droplets className="h-4 w-4 mr-1.5" /> Ver catálogo
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.product_id} className="overflow-hidden">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Droplets className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unit_price_cents)} un.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        item.quantity <= 1
                          ? removeItem(item.product_id)
                          : updateQty(item.product_id, item.quantity - 1)
                      }
                    >
                      {item.quantity <= 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQty(item.product_id, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-dashed">
            <CardHeader className="pb-2">
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
              <p className="text-xs text-muted-foreground mt-1.5">
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
            <div>
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <span className="text-xl font-bold text-accent">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <Link href="/checkout/schedule">
              <Button className="gap-1.5">
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
