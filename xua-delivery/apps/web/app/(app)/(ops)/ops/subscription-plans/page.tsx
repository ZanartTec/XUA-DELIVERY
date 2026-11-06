"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
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
import { todayIso } from "@/src/lib/datetime";
import { Eye, EyeOff, Loader2, MoreVertical, Pencil, Plus, Repeat } from "lucide-react";
import { cn, formatCurrency } from "@/src/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductOption {
  id: string;
  name: string;
  price_cents: number;
}

interface DistributorOption {
  id: string;
  name: string;
}

interface SubscriptionPlanItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  discount_percentage: number;
  unit_price_with_discount_cents: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  product: ProductOption;
  distributors: { distributor_id: string; distributor: DistributorOption }[];
}

interface PlanDraft {
  name: string;
  description: string;
  product_id: string;
  quantity: string;
  discount_percentage: string;
  unit_price_with_discount_cents: string;
  valid_from: string;
  valid_until: string;
  distributor_ids: string[];
}

const EMPTY_DRAFT: PlanDraft = {
  name: "",
  description: "",
  product_id: "",
  quantity: "",
  discount_percentage: "0",
  unit_price_with_discount_cents: "",
  valid_from: "",
  valid_until: "",
  distributor_ids: [],
};

function draftFromPlan(p: SubscriptionPlanItem): PlanDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    product_id: p.product.id,
    quantity: String(p.quantity),
    discount_percentage: String(p.discount_percentage),
    unit_price_with_discount_cents: (
      p.unit_price_with_discount_cents / 100
    ).toFixed(2),
    valid_from: p.valid_from.slice(0, 10),
    valid_until: p.valid_until ? p.valid_until.slice(0, 10) : "",
    distributor_ids: p.distributors.map((d) => d.distributor_id),
  };
}

function draftToPayload(d: PlanDraft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    product_id: d.product_id,
    quantity: parseInt(d.quantity, 10),
    discount_percentage: parseFloat(d.discount_percentage || "0"),
    unit_price_with_discount_cents: Math.round(
      parseFloat(d.unit_price_with_discount_cents || "0") * 100
    ),
    valid_from: d.valid_from,
    valid_until: d.valid_until || null,
    distributor_ids: d.distributor_ids,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const toReais = (cents: number) => (cents / 100).toFixed(2);

function PlanForm({
  draft,
  onChange,
  products,
  distributors,
}: {
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
  products: ProductOption[];
  distributors: DistributorOption[];
}) {
  const product = products.find((p) => p.id === draft.product_id);
  const base = product?.price_cents ?? 0;
  const unitCents = Math.round(parseFloat(draft.unit_price_with_discount_cents || "0") * 100);
  const qty = parseInt(draft.quantity || "0", 10) || 0;

  // Desconto e preço com desconto andam juntos (antes eram independentes e podiam se contradizer).
  function setDiscount(value: string) {
    const pct = Math.min(100, Math.max(0, parseFloat(value || "0")));
    onChange({ ...draft, discount_percentage: value, unit_price_with_discount_cents: base ? toReais(Math.round(base * (1 - pct / 100))) : draft.unit_price_with_discount_cents });
  }
  function setUnitPrice(value: string) {
    const cents = Math.round(parseFloat(value || "0") * 100);
    onChange({
      ...draft,
      unit_price_with_discount_cents: value,
      discount_percentage: base && cents > 0 ? String(Math.max(0, Math.round((1 - cents / base) * 10000) / 100)) : draft.discount_percentage,
    });
  }
  function setProduct(id: string) {
    const p = products.find((x) => x.id === id);
    const pct = parseFloat(draft.discount_percentage || "0");
    onChange({ ...draft, product_id: id, unit_price_with_discount_cents: p ? toReais(Math.round(p.price_cents * (1 - pct / 100))) : draft.unit_price_with_discount_cents });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome do plano">
        <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Ex.: Galão mensal — 4 entregas" className="h-11" />
      </Field>
      <Field label="Produto">
        <Select value={draft.product_id} onValueChange={setProduct}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Escolha o produto" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {formatCurrency(p.price_cents)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Descrição (opcional)">
          <Input value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} placeholder="Aparece para o cliente" className="h-11" />
        </Field>
      </div>
      <Field label="Quantidade total no plano">
        <Input type="number" min="1" step="1" inputMode="numeric" value={draft.quantity} onChange={(e) => onChange({ ...draft, quantity: e.target.value })} placeholder="Ex.: 20" className="h-11" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desconto (%)">
          <Input type="number" min="0" max="100" step="0.5" inputMode="decimal" value={draft.discount_percentage} onChange={(e) => setDiscount(e.target.value)} className="h-11" />
        </Field>
        <Field label="Preço por unidade">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={draft.unit_price_with_discount_cents} onChange={(e) => setUnitPrice(e.target.value)} className="h-11" />
        </Field>
      </div>
      {product && unitCents > 0 && qty > 0 ? (
        <p className="rounded-xl bg-sky/10 px-3 py-2 text-xs text-foreground sm:col-span-2">
          Avulso: {formatCurrency(base)} por unidade. No plano: {formatCurrency(unitCents)} · total {formatCurrency(unitCents * qty)} por {qty} unidades
          {base > unitCents ? ` (economia de ${formatCurrency((base - unitCents) * qty)})` : ""}.
        </p>
      ) : null}
      <Field label="Vale a partir de">
        <Input type="date" value={draft.valid_from} onChange={(e) => onChange({ ...draft, valid_from: e.target.value })} className="h-11" />
      </Field>
      <Field label="Vale até (opcional)">
        <Input type="date" value={draft.valid_until} onChange={(e) => onChange({ ...draft, valid_until: e.target.value })} className="h-11" />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label="Distribuidoras que atendem o plano"
          hint={distributors.length ? "Só aparecem distribuidoras com Mercado Pago conectado: a assinatura é paga no app." : undefined}
        >
          {distributors.length === 0 ? (
            // O-03: sem explicação, ninguém entendia por que não dava para criar plano.
            <Alert className="border-warning/30 bg-warning-surface">
              <AlertDescription className="text-warning-foreground">
                Nenhuma distribuidora com Mercado Pago conectado. A assinatura é paga no app, então a distribuidora precisa
                conectar a conta em Pagamento (no app da distribuidora) antes de entrar num plano.
              </AlertDescription>
            </Alert>
          ) : (
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={draft.distributor_ids}
              onValueChange={(ids) => onChange({ ...draft, distributor_ids: ids })}
              className="flex-wrap justify-start"
              spacing={2}
            >
              {distributors.map((d) => (
                <ToggleGroupItem key={d.id} value={d.id} className="h-10 rounded-md px-4 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-primary">
                  {d.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </Field>
      </div>
    </div>
  );
}

export default function OpsSubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ mode: "new" } | { mode: "edit"; plan: SubscriptionPlanItem } | null>(null);
  const [draft, setDraft] = useState<PlanDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<SubscriptionPlanItem | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/subscription-plans?activeOnly=false")
        .then((r) => r.json())
        .then((d) => setPlans(d.plans ?? [])),
      fetch("/api/products/all")
        .then((r) => r.json())
        .then((d) =>
          setProducts(
            (d.products ?? [])
              .filter((p: { is_active?: boolean }) => p.is_active !== false)
              .map((p: { id: string; name: string; price_cents: number }) => ({ id: p.id, name: p.name, price_cents: p.price_cents })),
          ),
        ),
      fetch("/api/distributor/all")
        .then((r) => r.json())
        .then((d) =>
          setDistributors(
            (d.distributors ?? [])
              // Assinatura é online-only: só distribuidoras com gateway MP podem ser vinculadas.
              .filter((dist: { mp_connected?: boolean }) => dist.mp_connected)
              .map((dist: { id: string; name: string }) => ({ id: dist.id, name: dist.name })),
          ),
        ),
    ])
      .catch(() => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, []);

  function validateDraft(d: PlanDraft): string | null {
    if (!d.name.trim()) return "Informe o nome do plano";
    if (!d.product_id) return "Escolha o produto";
    if (!d.quantity || parseInt(d.quantity, 10) < 1) return "Informe a quantidade total";
    if (!d.unit_price_with_discount_cents || parseFloat(d.unit_price_with_discount_cents) <= 0) return "Informe o preço por unidade";
    if (!d.valid_from) return "Informe a data de início";
    if (d.distributor_ids.length === 0) return "Escolha pelo menos uma distribuidora";
    return null;
  }

  function openForm(next: { mode: "new" } | { mode: "edit"; plan: SubscriptionPlanItem }) {
    setDraft(next.mode === "edit" ? draftFromPlan(next.plan) : { ...EMPTY_DRAFT, valid_from: todayIso() });
    setForm(next);
  }

  async function handleSave() {
    if (!form) return;
    const err = validateDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const editing = form.mode === "edit";
      const res = await fetch(editing ? `/api/subscription-plans/${form.plan.id}` : "/api/subscription-plans", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Erro ao salvar plano");
      }
      const data = await res.json();
      setPlans((prev) => (editing ? prev.map((p) => (p.id === data.plan.id ? data.plan : p)) : [...prev, data.plan]));
      setForm(null);
      toast.success(editing ? "Plano atualizado" : "Plano criado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar plano");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(plan: SubscriptionPlanItem, isActive: boolean) {
    try {
      const res = await fetch(`/api/subscription-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? data.plan : p)));
      toast.success(isActive ? "Plano disponível para os clientes" : "Plano encerrado para novas assinaturas");
    } catch {
      toast.error("Erro ao alterar status do plano");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Planos de assinatura" description="Pacotes de entregas recorrentes com desconto." />
      <div className="space-y-3 px-4 pb-4">
        {!loading && distributors.length === 0 ? (
          <Alert className="border-warning/30 bg-warning-surface">
            <AlertDescription className="text-warning-foreground">
              Nenhuma distribuidora com Mercado Pago conectado: sem isso não dá para oferecer assinatura (é paga no app).
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : plans.length === 0 ? (
          <EmptyState icon={Repeat} title="Nenhum plano criado" description="Sem plano, o cliente não vê a opção de assinatura no app." />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {plans.map((plan) => (
              <li key={plan.id} className={cn("flex items-center gap-3 px-4 py-3", !plan.is_active && "bg-surface-low")}>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-semibold", plan.is_active ? "text-foreground" : "text-muted-foreground")}>{plan.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {plan.product.name} · {plan.quantity} un · {formatCurrency(plan.unit_price_with_discount_cents)} cada ({plan.discount_percentage}% off)
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {plan.distributors.map((d) => d.distributor.name).join(", ") || "Sem distribuidora"}
                  </p>
                </div>
                <StatusBadge label={plan.is_active ? "Disponível" : "Encerrado"} tone={plan.is_active ? "success" : "neutral"} className="h-5 px-2 text-[11px]" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-touch" aria-label={`Ações do plano ${plan.name}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => openForm({ mode: "edit", plan })}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    {plan.is_active ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(plan)}>
                        <EyeOff /> Encerrar plano
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => setActive(plan, true)}>
                        <Eye /> Reabrir plano
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StickyActionBar>
        <Button variant="cta" size="xl" onClick={() => openForm({ mode: "new" })}>
          <Plus aria-hidden /> Novo plano
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={form?.mode === "edit" ? "Editar plano" : "Novo plano"}
        className="sm:max-w-2xl"
        footer={
          <Button variant="cta" size="xl" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {form?.mode === "edit" ? "Salvar alterações" : "Criar plano"}
          </Button>
        }
      >
        <PlanForm draft={draft} onChange={setDraft} products={products} distributors={distributors} />
      </ResponsiveDialog>

      <ConfirmAction
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Encerrar “${deactivating?.name ?? ""}”?`}
        description="Novos clientes não conseguem mais assinar. Quem já assina continua recebendo normalmente."
        confirmLabel="Encerrar plano"
        destructive
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false);
          setDeactivating(null);
        }}
      />
    </div>
  );
}
