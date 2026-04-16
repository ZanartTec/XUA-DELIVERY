"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
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
        <h1 className="text-lg font-bold font-heading text-foreground">Produtos</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold font-heading text-foreground">Produtos</h1>

      <div className="space-y-3">
        {products.map((product) => (
          <div key={product.id} className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold font-heading leading-tight">{product.name}</p>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={product.is_active ? "default" : "secondary"} className={product.is_active ? "bg-primary text-white" : ""}>
                  {product.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <Button
                  size="sm"
                  className={product.is_active ? "h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]" : "h-7 text-xs rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] shadow-none active:scale-[0.98]"}
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

            {/* Preview da imagem */}
            <div className="h-28 w-28 rounded-xl overflow-hidden bg-[#e1e3e4] flex items-center justify-center shrink-0">
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
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
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
                  className="text-xs rounded-xl border-0 bg-[#e1e3e4]"
                />
                <Button
                  size="sm"
                  disabled={saving[product.id]}
                  onClick={() => saveImageUrl(product)}
                  className="rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] shadow-none active:scale-[0.98]"
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
