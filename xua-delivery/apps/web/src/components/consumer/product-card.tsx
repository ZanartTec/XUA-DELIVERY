"use client";

import { Button } from "@/src/components/ui/button";
import { formatCurrency } from "@/src/lib/utils";
import { getRenderableProductImageUrl } from "@/src/lib/product-image";
import { Droplets, Plus } from "lucide-react";
import type { ProductItem } from "@/src/hooks/consumer/use-products";

interface ProductCardProps {
  product: ProductItem;
  onAdd: (product: ProductItem) => void;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const imageUrl = getRenderableProductImageUrl(product.image_url);

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-[#ffffff] shadow-[0_2px_12px_rgba(0,26,64,0.06)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)]">
      <div className="relative h-36 shrink-0 bg-[#f3f4f5] flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-2 transition-transform group-hover:scale-105"
          />
        ) : (
          <Droplets className="h-10 w-10 text-primary/30" />
        )}
        {!product.is_active && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <span className="rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold text-destructive">
              Indisponível
            </span>
          </div>
        )}
      </div>

      {/* flex-1 + mt-auto no rodapé: preço/botão sempre alinhados entre cards,
          mesmo com descrições de tamanhos diferentes */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-[#191c1d]">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-xs text-[#737688] leading-relaxed">{product.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className="text-base font-bold text-primary">
            {formatCurrency(product.price_cents)}
          </span>
          <Button
            size="icon"
            className="h-9 w-9 rounded-full bg-[#00E0FF] hover:bg-[#00E0FF]/90 text-[#001735] shadow-none hover:opacity-90 active:scale-95"
            disabled={!product.is_active}
            onClick={() => onAdd(product)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
