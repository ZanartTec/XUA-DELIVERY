"use client";

import Link from "next/link";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
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
    <div className="space-y-4 pb-4">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-bold font-heading text-foreground">Carrinho</h1>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#0041c8]/10">
            <ShoppingCart className="h-10 w-10 text-[#0041c8]/40" />
          </div>
          <p className="text-muted-foreground mb-3">Seu carrinho está vazio.</p>
          <Link href="/catalog">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-0 bg-[#e1e3e4] hover:bg-[#d1d3d4]"
            >
              <Droplets className="h-4 w-4 mr-1.5" /> Ver catálogo
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2 px-4">
            {items.map((item) => (
              <div
                key={item.product_id}
                className="flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#0041c8]/10 to-[#0055ff]/5">
                  <Droplets className="h-5 w-5 text-[#0041c8]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.unit_price_cents)} un.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e1e3e4] transition-colors hover:bg-[#d1d3d4] active:scale-95"
                    onClick={() =>
                      item.quantity <= 1
                        ? removeItem(item.product_id)
                        : updateQty(item.product_id, item.quantity - 1)
                    }
                  >
                    {item.quantity <= 1 ? (
                      <Trash2 className="h-3 w-3 text-destructive" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e1e3e4] transition-colors hover:bg-[#d1d3d4] active:scale-95"
                    onClick={() => updateQty(item.product_id, item.quantity + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Garrafões vazios */}
          <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <p className="text-sm font-semibold font-heading">Garrafões vazios para troca</p>
            <Input
              type="number"
              min={0}
              value={emptyBottlesQty}
              onChange={(e) => setEmptyBottles(Math.max(0, parseInt(e.target.value) || 0))}
              className="mt-2 w-24 rounded-xl border-0 bg-[#e1e3e4]"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Informe quantos garrafões vazios você tem para devolver.
            </p>
            {emptyBottlesQty === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Primeira compra? Será cobrada caução de R$ 30 por garrafão.
              </p>
            )}
          </div>

          {/* Subtotal + CTA */}
          <div className="mx-4 flex items-center justify-between rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div>
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <span className="text-xl font-bold text-[#0041c8]">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <Link href="/checkout/schedule">
              <Button className="gap-1.5 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] px-5 font-semibold shadow-none hover:opacity-90 active:scale-[0.98]">
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
