"use client";

import { PackageOpen } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ProductCard } from "@/src/components/consumer/product-card";
import type { ProductItem } from "@/src/hooks/consumer/use-products";

function ProductSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="h-36 rounded-t-2xl bg-[#e1e3e4]" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-2/3 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-1/2 rounded-lg bg-[#e1e3e4]" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-5 w-16 rounded-lg bg-[#e1e3e4]" />
          <div className="h-8 w-8 rounded-full bg-[#e1e3e4]" />
        </div>
      </div>
    </div>
  );
}

interface ProductGridProps {
  products: ProductItem[];
  loading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onAdd: (product: ProductItem) => void;
  onLoadMore: () => void;
}

export function ProductGrid({
  products,
  loading,
  hasNextPage,
  isFetchingNextPage,
  onAdd,
  onLoadMore,
}: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#5697E9]/15">
          <PackageOpen className="h-10 w-10 text-[#5697E9]/50" />
        </div>
        <p className="text-[#434656]">Nenhum produto encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
      {hasNextPage && (
        <div className="flex justify-center px-4">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? "Carregando..." : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
