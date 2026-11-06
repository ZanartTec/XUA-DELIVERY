"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Droplets, Eye, EyeOff, Loader2, MoreVertical, Pencil, Plus, Search } from "lucide-react";
import { cn, formatCurrency } from "@/src/lib/utils";
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
      <span className="text-sm font-medium text-foreground">{label}</span>
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
        <p className="text-sm font-medium text-foreground">Regra de vasilhame</p>
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
        <Field label="Água-base (estoque consumido)">
          <Select
            value={draft.base_product_id}
            onValueChange={(value) => onChange({ ...draft, base_product_id: value })}
          >
            <SelectTrigger className="h-11 w-full rounded-xl">
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
          label={draft.mode === "refil" ? "Vasilhame cobrado se faltar o vazio" : "Vasilhame incluso"}
        >
          <Select
            value={draft.bottle_product_id}
            onValueChange={(value) => onChange({ ...draft, bottle_product_id: value })}
          >
            <SelectTrigger className="h-11 w-full rounded-xl">
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
            <p className="text-xs text-warning-foreground">Cadastre antes um produto do tipo “Vasilhame”.</p>
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

      <Field label="Nome">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Nome do produto"
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label="Descrição">
        <Input
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Descrição opcional"
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label="Preço (R$)">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.price_cents}
          onChange={(e) => onChange({ ...draft, price_cents: e.target.value })}
          placeholder="0.00"
          className="h-11 rounded-xl"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="URL da imagem">
          <Input
            type="url"
            value={draft.image_url}
            onChange={(e) => onChange({ ...draft, image_url: e.target.value })}
            placeholder="https://exemplo.com/imagem.jpg"
            className="h-11 rounded-xl"
          />
        </Field>
      </div>
    </div>
  );
}

type StatusFilter = "active" | "inactive" | "all";

export default function OpsProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [form, setForm] = useState<{ mode: "new" } | { mode: "edit"; product: ProductItem } | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<ProductItem | null>(null);
  const productsById = new Map(products.map((p) => [p.id, p]));

  useEffect(() => {
    fetch("/api/products/all")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => toast.error("Erro ao carregar produtos"))
      .finally(() => setLoading(false));
  }, []);

  function openForm(next: { mode: "new" } | { mode: "edit"; product: ProductItem }) {
    setDraft(next.mode === "edit" ? draftFromProduct(next.product) : { ...EMPTY_DRAFT });
    setForm(next);
  }

  async function handleSave() {
    if (!form) return;
    const invalid = validateDraft(draft);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const editing = form.mode === "edit";
      const res = await fetch(editing ? `/api/products/${form.product.id}` : "/api/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Erro ao salvar produto"));
      const data = await res.json();
      setProducts((prev) => (editing ? prev.map((p) => (p.id === data.product.id ? data.product : p)) : [...prev, data.product]));
      setForm(null);
      toast.success(editing ? "Produto atualizado" : "Produto criado");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(product: ProductItem, isActive: boolean) {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === product.id ? data.product : p)));
      toast.success(isActive ? "Produto voltou ao catálogo" : "Produto saiu do catálogo");
    } catch {
      toast.error("Erro ao alterar status");
    }
  }

  const term = search.trim().toLowerCase();
  const visible = products.filter(
    (p) =>
      (status === "all" || (status === "active" ? p.is_active : !p.is_active)) &&
      (!term || p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term)),
  );
  const inactiveCount = products.filter((p) => !p.is_active).length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Produtos" description="O que aparece no catálogo do cliente." sticky>
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" className="h-11 rounded-xl pl-9" />
          </div>
          <ToggleGroup type="single" value={status} onValueChange={(v) => v && setStatus(v as StatusFilter)} spacing={2} className="justify-start">
            <ToggleGroupItem value="active" className="h-9 rounded-md bg-muted px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">No catálogo</ToggleGroupItem>
            <ToggleGroupItem value="inactive" className="h-9 rounded-md bg-muted px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Fora ({inactiveCount})</ToggleGroupItem>
            <ToggleGroupItem value="all" className="h-9 rounded-md bg-muted px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Todos</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PageHeader>

      <div className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : visible.length === 0 ? (
          <EmptyState icon={Droplets} title={term ? "Nenhum produto encontrado" : "Nenhum produto aqui"} />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {visible.map((product) => {
              const rule = bottleRuleLabel(product, productsById);
              return (
                <li key={product.id} className={cn("flex items-center gap-3 px-4 py-3", !product.is_active && "bg-surface-low")}>
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary/60">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      <Droplets className="size-6 text-sky" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-semibold", product.is_active ? "text-foreground" : "text-muted-foreground")}>{product.name}</p>
                    <p className="text-sm font-semibold text-primary tabular-nums">{formatCurrency(product.price_cents)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rule ? <StatusBadge label={rule} tone="info" className="h-5 px-2 text-[11px]" /> : null}
                      {!product.is_active ? <StatusBadge label="Fora do catálogo" tone="neutral" className="h-5 px-2 text-[11px]" /> : null}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-touch" aria-label={`Ações de ${product.name}`}>
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => openForm({ mode: "edit", product })}>
                        <Pencil /> Editar
                      </DropdownMenuItem>
                      {product.is_active ? (
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(product)}>
                          <EyeOff /> Tirar do catálogo
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setActive(product, true)}>
                          <Eye /> Voltar ao catálogo
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <StickyActionBar>
        <Button variant="cta" size="xl" onClick={() => openForm({ mode: "new" })}>
          <Plus aria-hidden /> Novo produto
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={form?.mode === "edit" ? "Editar produto" : "Novo produto"}
        className="sm:max-w-2xl"
        footer={
          <Button variant="cta" size="xl" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {form?.mode === "edit" ? "Salvar alterações" : "Criar produto"}
          </Button>
        }
      >
        <ProductForm draft={draft} onChange={setDraft} products={products} editingId={form?.mode === "edit" ? form.product.id : undefined} />
      </ResponsiveDialog>

      <ConfirmAction
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Tirar “${deactivating?.name ?? ""}” do catálogo?`}
        description="Clientes deixam de ver e pedir este produto. Pedidos já feitos não mudam. Dá para voltar depois."
        confirmLabel="Tirar do catálogo"
        destructive
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false);
          setDeactivating(null);
        }}
      />
    </div>
  );
}
