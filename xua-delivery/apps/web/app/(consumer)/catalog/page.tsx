"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import { Droplets, Plus, PackageOpen } from "lucide-react";
import { toast } from "sonner";

interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  deposit_cents: number;
  is_active: boolean;
}

function ProductSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4 space-y-3">
        <div className="h-28 rounded-lg bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/products");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Não foi possível carregar o catálogo.");
        }

        setProducts(data.products ?? []);
      } catch (err) {
        setProducts([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar o catálogo.");
      } finally {
        setLoading(false);
      }
    }

    void loadProducts();
  }, []);

  function handleAdd(product: ProductItem) {
    addItem({
      product_id: product.id,
      product_name: product.name,
      unit_price_cents: product.price_cents,
    });
    toast.success(`${product.name} adicionado ao carrinho`);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Catálogo</h1>
        <span className="text-xs text-muted-foreground">{products.length} produtos</span>
      </div>

      {error && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PackageOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Nenhum produto disponível na sua região.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                {/* Imagem do produto */}
                <div className="h-28 bg-gradient-to-br from-accent/10 to-primary/5 flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Droplets className="h-10 w-10 text-accent/40" />
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</h3>
                  {product.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-base font-bold text-accent">
                      {formatCurrency(product.price_cents)}
                    </p>
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      disabled={!product.is_active}
                      onClick={() => handleAdd(product)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {!product.is_active && (
                    <span className="text-[10px] text-destructive font-medium">Indisponível</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
