"use client";

import { PackageOpen } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/shared/empty-state";
import { ProductCard } from "@/src/components/consumer/product-card";
import type { ProductItem } from "@/src/hooks/consumer/use-products";

interface ProductGridProps {
  products: ProductItem[];
  loading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  quantityOf: (productId: string) => number;
  onAdd: (product: ProductItem) => void;
  onChangeQuantity: (product: ProductItem, quantity: number) => void;
  onLoadMore: () => void;
  emptyAction?: React.ReactNode;
}

export function ProductGrid({
  products,
  loading,
  hasNextPage,
  isFetchingNextPage,
  quantityOf,
  onAdd,
  onChangeQuantity,
  onLoadMore,
  emptyAction,
}: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-60 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <EmptyState icon={PackageOpen} title="Nenhum produto encontrado" description="Tente outra busca ou categoria." action={emptyAction} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            quantity={quantityOf(product.id)}
            onAdd={onAdd}
            onChangeQuantity={onChangeQuantity}
          />
        ))}
      </div>
      {hasNextPage ? (
        <div className="flex justify-center px-4">
          <Button variant="outline" size="lg" className="rounded-xl" disabled={isFetchingNextPage} onClick={onLoadMore}>
            {isFetchingNextPage ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
