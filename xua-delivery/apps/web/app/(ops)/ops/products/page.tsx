"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Droplets, Pencil, Plus, Save, X } from "lucide-react";
import { formatCurrency } from "@/src/lib/utils";
import { toast } from "sonner";

type ProductKind = "WATER" | "BOTTLE" | "OTHER";

interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  kind: ProductKind;
  bottle_product_id: string | null;
  requires_empty_return: boolean;
  base_product_id: string | null;
  is_active: boolean;
}

/**
 * Regra de vasilhame do produto (ver Product no schema):
 * - simple: produto comum, sem vasilhame;
 * - refil: água que exige 1 vazio por unidade na entrega; sem ele, cobra o vasilhame;
 * - combo: água + vasilhame, preço já inclui o vasilhame (consome estoque da água-base + vasilhame);
 * - bottle: o próprio vasilhame (preço usado na cobrança do refil).
 */
type BottleMode = "simple" | "refil" | "combo" | "bottle";

const BOTTLE_MODES: { value: BottleMode; label: string; hint: string }[] = [
  {
    value: "refil",
    label: "Água refil (troca de vasilhame)",
    hint: "Cliente devolve 1 vazio por unidade. Sem o vazio, o motorista cobra o vasilhame na entrega.",
  },
  {
    value: "combo",
    label: "Água + vasilhame",
    hint: "Preço já inclui o vasilhame. Nada a devolver nem cobrar na entrega.",
  },
  { value: "bottle", label: "Vasilhame", hint: "Valor cobrado quando falta o vazio do refil." },
  { value: "simple", label: "Produto comum", hint: "Sem regra de vasilhame (ex.: acessórios)." },
];

interface ProductDraft {
  name: string;
  description: string;
  image_url: string;
  price_cents: string;
  mode: BottleMode;
  bottle_product_id: string;
  base_product_id: string;
}

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  description: "",
  image_url: "",
  price_cents: "",
  mode: "simple",
  bottle_product_id: "",
  base_product_id: "",
};

function modeFromProduct(p: ProductItem): BottleMode {
  if (p.kind === "BOTTLE") return "bottle";
  if (p.base_product_id) return "combo";
  if (p.requires_empty_return) return "refil";
  return "simple";
}

function draftFromProduct(p: ProductItem): ProductDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    image_url: p.image_url ?? "",
    price_cents: (p.price_cents / 100).toFixed(2),
    mode: modeFromProduct(p),
    bottle_product_id: p.bottle_product_id ?? "",
    base_product_id: p.base_product_id ?? "",
  };
}

function draftToPayload(d: ProductDraft) {
  const water = d.mode === "refil" || d.mode === "combo";
  return {
    name: d.name,
    description: d.description || null,
    image_url: d.image_url || null,
    price_cents: Math.round(parseFloat(d.price_cents || "0") * 100),
    kind: (water ? "WATER" : d.mode === "bottle" ? "BOTTLE" : "OTHER") as ProductKind,
    bottle_product_id: water ? d.bottle_product_id || null : null,
    requires_empty_return: d.mode === "refil",
    base_product_id: d.mode === "combo" ? d.base_product_id || null : null,
  };
}

/** Mensagem de bloqueio do formulário, ou null se pode salvar. */
function validateDraft(d: ProductDraft): string | null {
  if (!d.name.trim()) return "Informe o nome do produto";
  if (!d.price_cents || parseFloat(d.price_cents) <= 0) return "Informe um preço válido";
  if ((d.mode === "refil" || d.mode === "combo") && !d.bottle_product_id) {
    return "Selecione o vasilhame vinculado";
  }
  if (d.mode === "combo" && !d.base_product_id) return "Selecione a água-base do combo";
  return null;
}

function bottleRuleLabel(p: ProductItem, byId: Map<string, ProductItem>): string | null {
  const bottle = p.bottle_product_id ? byId.get(p.bottle_product_id) : undefined;
  switch (modeFromProduct(p)) {
    case "refil":
      return `Refil · sem vazio cobra ${bottle ? formatCurrency(bottle.price_cents) : "o vasilhame"}`;
    case "combo":
      return "Vasilhame incluso";
    case "bottle":
      return "Vasilhame";
    default:
      return null;
  }
}

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
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
  products,
  editingId,
}: {
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
  products: ProductItem[];
  editingId?: string;
}) {
  const bottles = products.filter((p) => p.kind === "BOTTLE" && p.id !== editingId);
  const refilWaters = products.filter(
    (p) => p.requires_empty_return && p.id !== editingId
  );
  const bottle = bottles.find((b) => b.id === draft.bottle_product_id);
  const base = refilWaters.find((w) => w.id === draft.base_product_id);
  const priceCents = Math.round(parseFloat(draft.price_cents || "0") * 100);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Regra de vasilhame *
        </p>
        <RadioGroup
          value={draft.mode}
          onValueChange={(value) => onChange({ ...draft, mode: value as BottleMode })}
          className="grid gap-2 sm:grid-cols-2"
        >
          {BOTTLE_MODES.map((mode) => (
            <Label
              key={mode.value}
              htmlFor={`mode-${editingId ?? "new"}-${mode.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`mode-${editingId ?? "new"}-${mode.value}`} value={mode.value} className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold">{mode.label}</span>
                <span className="block text-xs font-normal text-muted-foreground">{mode.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      {draft.mode === "combo" && (
        <Field label="Água-base (estoque consumido) *">
          <Select
            value={draft.base_product_id}
            onValueChange={(value) => onChange({ ...draft, base_product_id: value })}
          >
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Selecione a água refil" />
            </SelectTrigger>
            <SelectContent>
              {refilWaters.map((water) => (
                <SelectItem key={water.id} value={water.id}>
                  {water.name} · {formatCurrency(water.price_cents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {(draft.mode === "refil" || draft.mode === "combo") && (
        <Field
          label={draft.mode === "refil" ? "Vasilhame cobrado se faltar o vazio *" : "Vasilhame incluso *"}
        >
          <Select
            value={draft.bottle_product_id}
            onValueChange={(value) => onChange({ ...draft, bottle_product_id: value })}
          >
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Selecione o vasilhame" />
            </SelectTrigger>
            <SelectContent>
              {bottles.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {formatCurrency(item.price_cents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bottles.length === 0 && (
            <p className="text-xs text-amber-700">Cadastre antes um produto do tipo “Vasilhame”.</p>
          )}
        </Field>
      )}

      {draft.mode === "refil" && bottle && priceCents > 0 && (
        <p className="rounded-xl bg-sky/10 px-3 py-2 text-xs text-ink sm:col-span-2">
          Cliente paga {formatCurrency(priceCents)} por unidade. Sem o vazio na entrega, o motorista cobra
          + {formatCurrency(bottle.price_cents)} (total {formatCurrency(priceCents + bottle.price_cents)}),
          entrega parcial ou cancela.
        </p>
      )}
      {draft.mode === "combo" && base && bottle && (
        <p className="rounded-xl bg-sky/10 px-3 py-2 text-xs text-ink sm:col-span-2">
          Referência: {base.name} {formatCurrency(base.price_cents)} + {bottle.name}{" "}
          {formatCurrency(bottle.price_cents)} = {formatCurrency(base.price_cents + bottle.price_cents)}.
        </p>
      )}

      <Field label="Nome *">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Nome do produto"
          className="rounded-xl border-hairline text-sm"
        />
      </Field>
      <Field label="Descrição">
        <Input
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Descrição opcional"
          className="rounded-xl border-hairline text-sm"
        />
      </Field>
      <Field label="Preço (R$) *">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.price_cents}
          onChange={(e) => onChange({ ...draft, price_cents: e.target.value })}
          placeholder="0.00"
          className="rounded-xl border-hairline text-sm"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="URL da imagem">
          <Input
            type="url"
            value={draft.image_url}
            onChange={(e) => onChange({ ...draft, image_url: e.target.value })}
            placeholder="https://exemplo.com/imagem.jpg"
            className="rounded-xl border-hairline text-sm"
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
  const productsById = new Map(products.map((p) => [p.id, p]));

  useEffect(() => {
    fetch("/api/products/all")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => toast.error("Erro ao carregar produtos"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    const invalid = validateDraft(draft);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Erro ao criar produto"));
      const data = await res.json();
      setProducts((prev) => [...prev, data.product]);
      setDraft({ ...EMPTY_DRAFT });
      setCreating(false);
      toast.success("Produto criado");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Erro ao criar produto");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    const invalid = validateDraft(editDraft);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(editDraft)),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Erro ao atualizar produto"));
      const data = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === id ? data.product : p)));
      setEditId(null);
      toast.success("Produto atualizado");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Erro ao atualizar produto");
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
            <div className="h-4 w-48 rounded-lg bg-surface-highest" />
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
            className="rounded-xl bg-cta hover:bg-cta/90 text-cta-foreground shadow-none active:scale-[0.98]"
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
          <ProductForm draft={draft} onChange={setDraft} products={products} />
          <Button
            size="sm"
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-cta hover:bg-cta/90 text-cta-foreground shadow-none active:scale-[0.98]"
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
                <ProductForm
                  draft={editDraft}
                  onChange={setEditDraft}
                  products={products}
                  editingId={product.id}
                />
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => handleUpdate(product.id)}
                  className="rounded-xl bg-cta hover:bg-cta/90 text-cta-foreground shadow-none active:scale-[0.98]"
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
                    <div className="h-16 w-16 rounded-xl overflow-hidden bg-surface-highest flex items-center justify-center shrink-0">
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
                      </p>
                      {bottleRuleLabel(product, productsById) && (
                        <Badge variant="secondary" className="mt-1.5 font-medium">
                          {bottleRuleLabel(product, productsById)}
                        </Badge>
                      )}
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
                    className="h-7 text-xs rounded-xl border-0 bg-surface-highest text-foreground hover:bg-surface-highest"
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    className={
                      product.is_active
                        ? "h-7 text-xs rounded-xl border-0 bg-surface-highest text-foreground hover:bg-surface-highest"
                        : "h-7 text-xs rounded-xl bg-cta hover:bg-cta/90 text-cta-foreground shadow-none active:scale-[0.98]"
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
