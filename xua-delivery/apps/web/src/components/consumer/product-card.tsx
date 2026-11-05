"use client";

import { Droplets, Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { QuantityStepper } from "@/src/components/shared/quantity-stepper";
import { formatCurrency } from "@/src/lib/utils";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";
import type { ProductItem } from "@/src/hooks/consumer/use-products";

interface ProductCardProps {
  product: ProductItem;
  /** Quantidade já no carrinho (0 = mostra o "+"). */
  quantity: number;
  onAdd: (product: ProductItem) => void;
  onChangeQuantity: (product: ProductItem, quantity: number) => void;
}

export function ProductCard({ product, quantity, onAdd, onChangeQuantity }: ProductCardProps) {
  const imageUrl = getRenderableProductImageUrl(product.image_url);

  return (
    <Card className="flex flex-col group h-full gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-[0_2px_12px_rgba(0,26,64,0.06)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)]">
      <div className="relative flex h-36 shrink-0 items-center justify-center overflow-hidden bg-linear-to-b from-secondary/60 to-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-2 transition-transform group-hover:scale-105"
          />
        ) : (
          <Droplets className="size-12 text-sky/60" aria-hidden />
        )}
        {!product.is_active ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <span className="rounded-lg bg-card px-2 py-1 text-[11px] font-bold text-destructive">Indisponível</span>
          </div>
        ) : null}
      </div>

      {/* flex-1 + mt-auto: preço/ação alinhados entre cards de descrições diferentes */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm leading-tight font-semibold text-foreground">{product.name}</h3>
        {product.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{product.description}</p>
        ) : null}
        {product.requires_empty_return ? (
          <p className="text-[11px] font-medium text-primary">Troca do vasilhame vazio</p>
        ) : null}
        <div className="mt-auto flex min-h-10 items-center justify-between gap-1 pt-1.5">
          <span className="text-base font-bold text-primary">{formatCurrency(product.price_cents)}</span>
          {quantity > 0 ? (
            <QuantityStepper
              size="sm"
              value={quantity}
              itemLabel={product.name}
              onChange={(q) => onChangeQuantity(product, q)}
              className="p-0.5"
            />
          ) : (
            <Button
              variant="cta"
              size="icon-lg"
              className="rounded-md shadow-none active:scale-95"
              disabled={!product.is_active}
              aria-label={`Adicionar ${product.name} ao carrinho`}
              onClick={() => onAdd(product)}
            >
              <Plus />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
