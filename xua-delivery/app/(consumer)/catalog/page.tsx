"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { useCartStore } from "@/src/store/cart";
import { formatCurrency } from "@/src/lib/utils";
import type { Product } from "@/src/types";

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    fetch("/api/orders?type=products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold">Catálogo</h1>
        <p className="text-gray-500">Carregando produtos...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Catálogo</h1>
      {products.length === 0 && (
        <p className="text-gray-500">Nenhum produto disponível na sua região.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader>
              <CardTitle className="text-base">{product.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{product.description}</p>
              <p className="text-lg font-semibold mt-2">
                {formatCurrency(product.price_cents)}
              </p>
              {!product.is_active && (
                <span className="text-xs text-red-500">Indisponível</span>
              )}
            </CardContent>
            <CardFooter>
              <Button
                size="sm"
                disabled={!product.is_active}
                onClick={() =>
                  addItem({
                    product_id: product.id,
                    product_name: product.name,
                    unit_price_cents: product.price_cents,
                  })
                }
              >
                Adicionar
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
