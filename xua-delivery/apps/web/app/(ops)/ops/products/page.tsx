"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Droplets, Pencil, Plus, Save, X } from "lucide-react";
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

interface ProductDraft {
  name: string;
  description: string;
  image_url: string;
  price_cents: string;
  deposit_cents: string;
}

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  description: "",
  image_url: "",
  price_cents: "",
  deposit_cents: "",
};

function draftFromProduct(p: ProductItem): ProductDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    image_url: p.image_url ?? "",
    price_cents: (p.price_cents / 100).toFixed(2),
    deposit_cents: (p.deposit_cents / 100).toFixed(2),
  };
}

function draftToPayload(d: ProductDraft) {
  return {
    name: d.name,
    description: d.description || null,
    image_url: d.image_url || null,
    price_cents: Math.round(parseFloat(d.price_cents || "0") * 100),
    deposit_cents: Math.round(parseFloat(d.deposit_cents || "0") * 100),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function ProductForm({
  draft,
  onChange,
}: {
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome *">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Nome do produto"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="Descri\u00e7\u00e3o">
        <Input
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Descri\u00e7\u00e3o opcional"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="Pre\u00e7o (R$) *">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.price_cents}
          onChange={(e) => onChange({ ...draft, price_cents: e.target.value })}
          placeholder="0.00"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="Dep\u00f3sito (R$)">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.deposit_cents}
          onChange={(e) => onChange({ ...draft, deposit_cents: e.target.value })}
          placeholder="0.00"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="URL da imagem">
          <Input
            type="url"
            value={draft.image_url}
            onChange={(e) => onChange({ ...draft, image_url: e.target.value })}
            placeholder="https://exemplo.com/imagem.jpg"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

export default function OpsProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>({ ...EMPTY_DRAFT });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProductDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/products/all")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => toast.error("Erro ao carregar produtos"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!draft.name.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    if (!draft.price_cents || parseFloat(draft.price_cents) <= 0) {
      toast.error("Informe um pre\u00e7o v\u00e1lido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProducts((prev) => [...prev, data.product]);
      setDraft({ ...EMPTY_DRAFT });
      setCreating(false);
      toast.success("Produto criado");
    } catch {
      toast.error("Erro ao criar produto");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editDraft.name.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    if (!editDraft.price_cents || parseFloat(editDraft.price_cents) <= 0) {
      toast.error("Informe um pre\u00e7o v\u00e1lido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(editDraft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === id ? data.product : p)));
      setEditId(null);
      toast.success("Produto atualizado");
    } catch {
      toast.error("Erro ao atualizar produto");
    } finally {
      setSaving(false);
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
        prev.map((p) => (p.id === product.id ? data.product : p))
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
          <div
            key={i}
            className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm"
          >
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading text-foreground">Produtos</h1>
        {!creating && (
          <Button
            size="sm"
            onClick={() => {
              setCreating(true);
              setEditId(null);
            }}
            className="rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] shadow-none active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 mr-1" />
            Novo produto
          </Button>
        )}
      </div>

      {/* Formulário de criação */}
      {creating && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-heading">Novo produto</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setDraft({ ...EMPTY_DRAFT });
              }}
              className="h-7 w-7 p-0 rounded-xl"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ProductForm draft={draft} onChange={setDraft} />
          <Button
            size="sm"
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] shadow-none active:scale-[0.98]"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? "Salvando..." : "Criar produto"}
          </Button>
        </div>
      )}

      {/* Lista de produtos */}
      <div className="space-y-3">
        {products.map((product) => (
          <div
            key={product.id}
            className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3"
          >
            {editId === product.id ? (
              /* Modo edição */
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold font-heading">Editando produto</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditId(null)}
                    className="h-7 w-7 p-0 rounded-xl"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ProductForm draft={editDraft} onChange={setEditDraft} />
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => handleUpdate(product.id)}
                  className="rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] shadow-none active:scale-[0.98]"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </>
            ) : (
              /* Modo visualização */
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    {/* Preview da imagem */}
                    <div className="h-16 w-16 rounded-xl overflow-hidden bg-[#e1e3e4] flex items-center justify-center shrink-0">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Droplets className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold font-heading leading-tight">
                        {product.name}
                      </p>
                      {product.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {product.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(product.price_cents)}
                        {product.deposit_cents > 0 &&
                          ` + dep\u00f3sito ${formatCurrency(product.deposit_cents)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={product.is_active ? "default" : "secondary"}
                      className={product.is_active ? "bg-primary text-white" : ""}
                    >
                      {product.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditId(product.id);
                      setEditDraft(draftFromProduct(product));
                      setCreating(false);
                    }}
                    className="h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    className={
                      product.is_active
                        ? "h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                        : "h-7 text-xs rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] shadow-none active:scale-[0.98]"
                    }
                    onClick={() => toggleActive(product)}
                  >
                    {product.is_active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
