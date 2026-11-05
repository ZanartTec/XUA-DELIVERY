"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { useCartStore } from "@/src/store/cart";
import { useIsClient } from "@/src/hooks/use-is-client";
import { formatCurrency } from "@/src/lib/utils";
import { plural } from "@/src/lib/format";

/** Barra do carrinho na zona do polegar — único feedback ao adicionar itens (sem toast). */
export function CatalogCartSummaryCard() {
  const items = useCartStore((s) => s.items);
  const mounted = useIsClient();

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const subtotalCents = items.reduce((acc, item) => acc + item.unit_price_cents * item.quantity, 0);

  if (!mounted || totalItems === 0) return null;

  return (
    <StickyActionBar>
      <Button asChild variant="cta" size="xl" className="justify-between">
        <Link href="/cart" aria-label={`Ver carrinho: ${plural(totalItems, "item", "itens")}, ${formatCurrency(subtotalCents)}`}>
          <span className="flex items-center gap-2">
            <span className="relative">
              <ShoppingCart aria-hidden />
              <span className="absolute -top-2 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {totalItems}
              </span>
            </span>
            <span className="ml-2">Ver carrinho</span>
          </span>
          <span className="tabular-nums">{formatCurrency(subtotalCents)}</span>
        </Link>
      </Button>
    </StickyActionBar>
  );
}
