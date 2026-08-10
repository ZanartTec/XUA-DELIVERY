"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ShoppingCart } from "lucide-react";
import { useCartStore } from "@/src/store/cart";
import { useIsClient } from "@/src/hooks/use-is-client";
import { formatCurrency } from "@/src/lib/utils";

export function CatalogCartSummaryCard() {
  const items = useCartStore((s) => s.items);
  const mounted = useIsClient();
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
    const subtotalCents = items.reduce(
      (acc, item) => acc + item.unit_price_cents * item.quantity,
      0,
    );
    return { totalItems, subtotalCents, isEmpty: totalItems === 0 };
  }, [items]);

  if (!mounted || summary.isEmpty) return null;

  return (
    <div className="fixed bottom-[4.5rem] inset-x-3 z-50">
      {/* Painel expandido com itens */}
      {expanded && (
        <div className="mb-1 overflow-hidden rounded-lg border border-[#e1e8f5] bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,26,64,0.10)]">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#7d8494]">
            Itens no carrinho
          </p>
          <div className="max-h-44 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#eaf1ff] text-[10px] font-bold text-[#32466e]">
                  {item.quantity}
                </span>
                <span className="flex-1 truncate text-sm text-[#191c1d]">{item.product_name}</span>
                <span className="shrink-0 text-sm font-semibold text-[#32466e]">
                  {formatCurrency(item.unit_price_cents * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra principal compacta */}
      <div className="flex items-center gap-2 rounded-lg border border-[#d0dcf5] bg-white px-3 py-2 shadow-[0_4px_16px_rgba(0,26,64,0.12)]">
        {/* Área clicável de expandir */}
        <button
          type="button"
          aria-label={expanded ? "Recolher itens" : "Ver itens do carrinho"}
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2.5 min-w-0"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#eaf1ff]">
            <ShoppingCart className="h-4 w-4 text-[#32466e]" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <span className="text-sm font-bold text-[#191c1d]">
              {summary.totalItems} {summary.totalItems === 1 ? "item" : "itens"}
            </span>
            <span className="mx-1.5 text-[#c3c5d9]">·</span>
            <span className="text-sm font-bold text-[#32466e]">
              {formatCurrency(summary.subtotalCents)}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#7d8494]" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#7d8494]" />
          )}
        </button>

        {/* CTA */}
        <Link
          href="/cart"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#00E0FF] px-3 text-sm font-bold text-[#001735] transition-opacity hover:opacity-90 active:scale-[0.97] whitespace-nowrap"
        >
          <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
          Ir para o carrinho
        </Link>
      </div>
    </div>
  );
}