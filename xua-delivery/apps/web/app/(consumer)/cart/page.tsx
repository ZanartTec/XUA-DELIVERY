"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
  Droplets,
  Recycle,
  Info,
} from "lucide-react";

export default function CartPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const items = useCartStore((s) => s.items);
  const emptyBottlesQty = useCartStore((s) => s.emptyBottlesQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const setEmptyBottles = useCartStore((s) => s.setEmptyBottles);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);

  const subtotal = mounted ? getSubtotalCents() : 0;
  const deliveryFeeCents = 500;
  const totalCents = subtotal + deliveryFeeCents;
  const isEmpty = mounted ? items.length === 0 : true;

  const gallonCount = items
    .filter(
      (i) =>
        i.product_name.toLowerCase().includes("galão") ||
        i.product_name.toLowerCase().includes("garrafão") ||
        i.product_name.toLowerCase().includes("20l"),
    )
    .reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)] pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-bold font-heading text-[#191c1d]">
          Seu Carrinho
        </h1>
        <p className="text-sm text-[#737688] mt-0.5">
          Revise seu pedido de hidratação premium
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center px-4">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#5697E9]/15">
            <ShoppingCart className="h-10 w-10 text-[#5697E9]/50" />
          </div>
          <p className="text-[#737688] mb-3">Seu carrinho está vazio.</p>
          <Link href="/catalog">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-[#e1e3e4] bg-white hover:bg-[#f8f9fa]"
            >
              <Droplets className="h-4 w-4 mr-1.5 text-primary" /> Ver
              catálogo
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Product cards */}
          <div className="space-y-3 px-4 mt-2">
            {items.map((item) => (
              <div
                key={item.product_id}
                className="relative rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(0,26,64,0.07)]"
              >
                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeItem(item.product_id)}
                  className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-[#737688]" />
                </button>

                <div className="flex gap-4">
                  {/* Product Image */}
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#5697E9]/10 to-[#5697E9]/05 overflow-hidden">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.product_name}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover rounded-xl"
                      />
                    ) : (
                      <Droplets className="h-8 w-8 text-primary/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pr-6">
                    <h3 className="font-semibold text-sm text-[#191c1d] font-heading leading-tight">
                      {item.product_name}
                    </h3>
                    <p className="text-primary font-bold text-base mt-1">
                      {formatCurrency(item.unit_price_cents)}
                    </p>
                  </div>
                </div>

                {/* Quantity stepper */}
                <div className="flex items-center justify-end mt-3">
                  <div className="flex items-center rounded-full bg-[#f0f2f4] p-0.5">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm transition-all hover:bg-[#f8f9fa] active:scale-95"
                      onClick={() =>
                        item.quantity <= 1
                          ? removeItem(item.product_id)
                          : updateQty(item.product_id, item.quantity - 1)
                      }
                    >
                      {item.quantity <= 1 ? (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-[#191c1d]" />
                      )}
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-[#191c1d]">
                      {String(item.quantity).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm transition-all hover:bg-[#f8f9fa] active:scale-95"
                      onClick={() =>
                        updateQty(item.product_id, item.quantity + 1)
                      }
                    >
                      <Plus className="h-3.5 w-3.5 text-[#191c1d]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty Gallons for Exchange */}
          <div className="mx-4 mt-4 rounded-2xl bg-[#5697E9]/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5697E9]/15">
                  <Recycle className="h-5 w-5 text-[#5697E9]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm text-[#191c1d] font-heading">
                    Garrafões Vazios para Troca
                  </h3>
                  <p className="text-xs text-[#444] mt-1 leading-relaxed">
                    Informe quantos garrafões vazios você tem para devolver.
                  </p>

                  {/* Stepper for empty bottles */}
                  <div className="flex items-center mt-2.5 rounded-full bg-white/70 p-0.5 w-fit">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm transition-all hover:bg-[#f8f9fa] active:scale-95"
                      onClick={() =>
                        setEmptyBottles(Math.max(0, emptyBottlesQty - 1))
                      }
                    >
                      <Minus className="h-3 w-3 text-[#191c1d]" />
                    </button>
                    <span className="w-7 text-center text-xs font-semibold text-[#191c1d]">
                      {String(emptyBottlesQty).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm transition-all hover:bg-[#f8f9fa] active:scale-95"
                      onClick={() => setEmptyBottles(emptyBottlesQty + 1)}
                    >
                      <Plus className="h-3 w-3 text-[#191c1d]" />
                    </button>
                  </div>
                </div>
              </div>
              {emptyBottlesQty === 0 ? (
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#5697E9]/15">
                  <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-600 leading-tight font-medium">
                    Primeira compra? Será cobrada caução de R$ 30 por garrafão.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#5697E9]/15">
                  <Info className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <p className="text-[10px] text-primary/70 leading-tight">
                    Necessário para preço de refil
                  </p>
                </div>
              )}
            </div>

          {/* Cost Breakdown */}
          <div className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(0,26,64,0.07)]">
            <div className="flex justify-between text-sm text-[#444]">
              <span>Subtotal</span>
              <span className="font-medium text-[#191c1d]">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-[#444] mt-2">
              <span>Taxa de Entrega</span>
              <span className="font-medium text-[#191c1d]">
                {formatCurrency(deliveryFeeCents)}
              </span>
            </div>
            <div className="my-3 h-px bg-[#e1e3e4]" />
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#737688] font-medium">
                  Valor Total
                </p>
                <p className="text-xl font-bold text-primary font-heading">
                  {formatCurrency(totalCents)}
                </p>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="mx-4 mt-4">
            <Link href="/checkout/distributor" className="block">
              <Button className="w-full h-12 rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-semibold text-sm shadow-none hover:opacity-90 active:scale-[0.98] transition-all">
                Continuar para Agendamento
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
