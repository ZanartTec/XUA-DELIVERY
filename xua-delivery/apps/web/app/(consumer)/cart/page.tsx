"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Droplets, ShoppingCart } from "lucide-react";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { plural } from "@/src/lib/format";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";
import { useIsClient } from "@/src/hooks/use-is-client";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { EmptyState } from "@/src/components/shared/empty-state";
import { QuantityStepper } from "@/src/components/shared/quantity-stepper";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { BottleExchangeNotice } from "@/src/components/consumer/bottle-exchange-notice";

export default function CartPage() {
  const mounted = useIsClient();
  const items = useCartStore((s) => s.items);
  const updateQty = useCartStore((s) => s.updateQty);
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);

  const subtotal = mounted ? getSubtotalCents() : 0;
  const totalItems = mounted ? items.reduce((acc, i) => acc + i.quantity, 0) : 0;

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="Carrinho" />
        <EmptyState
          icon={ShoppingCart}
          title="Seu carrinho está vazio"
          description="Escolha a água e os produtos que quer receber."
          action={
            <Button asChild variant="cta" size="xl">
              <Link href="/catalog">
                <Droplets />
                Ver catálogo
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Carrinho" description={plural(totalItems, "item", "itens")} />

      <div className="space-y-4 px-4">
        <ul className="space-y-3" aria-label="Itens do carrinho">
          {items.map((item) => {
            const imageUrl = getRenderableProductImageUrl(item.image_url);
            return (
              <li key={item.product_id}>
                <Card className="flex flex-col flex-row items-center gap-3 rounded-2xl border-0 p-3 shadow-[0_1px_8px_rgba(0,26,64,0.07)]">
                  <div className="flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-secondary to-muted">
                    {imageUrl ? (
                      <Image src={imageUrl} alt="" width={72} height={72} className="size-full object-cover" />
                    ) : (
                      <Droplets className="size-8 text-sky/60" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <h3 className="line-clamp-2 text-sm leading-tight font-semibold text-foreground">{item.product_name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatCurrency(item.unit_price_cents)} cada
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <QuantityStepper
                        size="sm"
                        value={item.quantity}
                        itemLabel={item.product_name}
                        onChange={(q) => updateQty(item.product_id, q)}
                      />
                      <span className="text-base font-bold text-primary tabular-nums">
                        {formatCurrency(item.unit_price_cents * item.quantity)}
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>

        <Button asChild variant="link" className="px-0">
          <Link href="/catalog">+ Adicionar mais itens</Link>
        </Button>

        {/* Regra de vasilhame na entrega (só aparece com itens refil) */}
        <BottleExchangeNotice items={items} />

        <Card className="flex flex-col gap-3 rounded-2xl border-0 p-4 shadow-[0_1px_8px_rgba(0,26,64,0.07)]">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-medium text-foreground tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="font-heading text-xl font-bold text-primary tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
        </Card>
      </div>

      <StickyActionBar>
        <Button asChild variant="cta" size="xl" className="justify-between">
          <Link href="/checkout/schedule">
            <span>Escolher entrega</span>
            <span className="flex items-center gap-1 tabular-nums">
              {formatCurrency(subtotal)}
              <ChevronRight />
            </span>
          </Link>
        </Button>
      </StickyActionBar>
    </div>
  );
}
