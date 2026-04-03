"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Droplets, ImageIcon, Save } from "lucide-react";
import { formatCurrency } from "@/src/lib/utils";
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

type DraftMap = Record<string, string>;

export default function OpsProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/products/all")
      .then((r) => r.json())
      .then((data) => {
        const list: ProductItem[] = data.products ?? [];
        setProducts(list);
        const initial: DraftMap = {};
        for (const p of list) initial[p.id] = p.image_url ?? "";
        setDrafts(initial);
      })
      .catch(() => toast.error("Erro ao carregar produtos"))
      .finally(() => setLoading(false));
  }, []);

  async function saveImageUrl(product: ProductItem) {
    const url = drafts[product.id]?.trim() || null;
    setSaving((prev) => ({ ...prev, [product.id]: true }));
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, image_url: data.product.image_url } : p))
      );
      toast.success("Imagem atualizada");
    } catch {
      toast.error("Erro ao salvar imagem");
    } finally {
      setSaving((prev) => ({ ...prev, [product.id]: false }));
    }
  }

  async function toggleActive(product: ProductItem) {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: data.product.is_active } : p))
      );
      toast.success(data.product.is_active ? "Produto ativado" : "Produto desativado");
    } catch {
      toast.error("Erro ao alterar status");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-foreground">Produtos</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-4">
              <div className="h-4 w-48 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Produtos</h1>

      <div className="space-y-3">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm leading-tight">{product.name}</CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={product.is_active ? "default" : "secondary"}>
                    {product.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => toggleActive(product)}
                  >
                    {product.is_active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(product.price_cents)}
                {product.deposit_cents > 0 && ` + depósito ${formatCurrency(product.deposit_cents)}`}
              </p>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Preview da imagem */}
              <div className="h-28 w-28 rounded-lg border overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Droplets className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>

              {/* Campo de URL da imagem */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  URL da imagem
                </label>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={drafts[product.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))
                    }
                    className="text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={saving[product.id]}
                    onClick={() => saveImageUrl(product)}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
