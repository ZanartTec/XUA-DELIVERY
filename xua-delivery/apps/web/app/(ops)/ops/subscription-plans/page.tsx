"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Pencil, Plus, Save, X, ToggleLeft, ToggleRight } from "lucide-react";
import { formatCurrency } from "@/src/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductOption {
  id: string;
  name: string;
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: DistributorOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-white"
                : "border-[#d9dde3] bg-white text-muted-foreground hover:border-primary"
            }`}
          >
            {o.name}
          </button>
        );
      })}
      {options.length === 0 && (
        <span className="text-xs text-muted-foreground">
          Nenhum distribuidor disponível
        </span>
      )}
    </div>
  );
}

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
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome *">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Ex: Galão mensal — 5 entregas"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>

      <Field label="Produto *">
        <select
          value={draft.product_id}
          onChange={(e) => onChange({ ...draft, product_id: e.target.value })}
          className="w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Selecione…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Descrição">
          <Input
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder="Descrição opcional exibida ao consumidor"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
      </div>

      <Field label="Qtd. total de produtos *">
        <Input
          type="number"
          min="1"
          step="1"
          value={draft.quantity}
          onChange={(e) => onChange({ ...draft, quantity: e.target.value })}
          placeholder="Ex: 20"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>

      <Field label="Desconto (%)">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={draft.discount_percentage}
          onChange={(e) =>
            onChange({ ...draft, discount_percentage: e.target.value })
          }
          placeholder="0"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>

      <Field label="Preço por produto c/ desconto (R$) *">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={draft.unit_price_with_discount_cents}
          onChange={(e) =>
            onChange({
              ...draft,
              unit_price_with_discount_cents: e.target.value,
            })
          }
          placeholder="Ex: 28.00"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>

      <Field label="Válido de *">
        <Input
          type="date"
          value={draft.valid_from}
          onChange={(e) => onChange({ ...draft, valid_from: e.target.value })}
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>

      <Field label="Válido até">
        <Input
          type="date"
          value={draft.valid_until}
          onChange={(e) => onChange({ ...draft, valid_until: e.target.value })}
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Distribuidores vinculados *">
          <MultiSelect
            options={distributors}
            selected={draft.distributor_ids}
            onChange={(ids) => onChange({ ...draft, distributor_ids: ids })}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OpsSubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<PlanDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PlanDraft>({ ...EMPTY_DRAFT });

  // -------------------------------------------------------------------------
  // Load data
  // -------------------------------------------------------------------------
  useEffect(() => {
    Promise.all([
      fetch("/api/subscription-plans?activeOnly=false")
        .then((r) => r.json())
        .then((d) => setPlans(d.plans ?? [])),
      fetch("/api/products/all")
        .then((r) => r.json())
        .then((d) =>
          setProducts(
            (d.products ?? []).map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            }))
          )
        ),
      fetch("/api/distributor/all")
        .then((r) => r.json())
        .then((d) =>
          setDistributors(
            (d.distributors ?? []).map(
              (dist: { id: string; name: string }) => ({
                id: dist.id,
                name: dist.name,
              })
            )
          )
        ),
    ])
      .catch(() => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, []);

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  function validateDraft(d: PlanDraft): string | null {
    if (!d.name.trim()) return "Informe o nome do plano";
    if (!d.product_id) return "Selecione um produto";
    if (!d.quantity || parseInt(d.quantity, 10) < 1)
      return "Informe a quantidade total de produtos";
    if (
      !d.unit_price_with_discount_cents ||
      parseFloat(d.unit_price_with_discount_cents) <= 0
    )
      return "Informe o preço por produto";
    if (!d.valid_from) return "Informe a data de início de validade";
    if (d.distributor_ids.length === 0)
      return "Selecione pelo menos um distribuidor";
    return null;
  }

  async function handleCreate() {
    const err = validateDraft(newDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(newDraft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlans((prev) => [...prev, data.plan]);
      setNewDraft({ ...EMPTY_DRAFT });
      setCreating(false);
      toast.success("Plano criado");
    } catch {
      toast.error("Erro ao criar plano");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  async function handleUpdate(id: string) {
    const err = validateDraft(editDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/subscription-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(editDraft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === id ? data.plan : p)));
      setEditId(null);
      toast.success("Plano atualizado");
    } catch {
      toast.error("Erro ao atualizar plano");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Toggle active
  // -------------------------------------------------------------------------
  async function toggleActive(plan: SubscriptionPlanItem) {
    try {
      const res = await fetch(`/api/subscription-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !plan.is_active }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? data.plan : p)));
      toast.success(data.plan.is_active ? "Plano ativado" : "Plano desativado");
    } catch {
      toast.error("Erro ao alterar status do plano");
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Carregando planos…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-[#191c1d]">
            Planos de Assinatura
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os planos disponíveis para os consumidores
          </p>
        </div>
        {!creating && (
          <Button
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4" />
            Novo plano
          </Button>
        )}
      </div>

      {/* New plan form */}
      {creating && (
        <div className="rounded-2xl border border-[#d9dde3] bg-white p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Novo plano</p>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setCreating(false);
                setNewDraft({ ...EMPTY_DRAFT });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <PlanForm
            draft={newDraft}
            onChange={setNewDraft}
            products={products}
            distributors={distributors}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5 rounded-xl"
              disabled={saving}
              onClick={handleCreate}
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando…" : "Criar plano"}
            </Button>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          Nenhum plano cadastrado ainda.
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-[#d9dde3] bg-white p-4 shadow-sm space-y-3"
            >
              {editId === plan.id ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">Editar plano</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <PlanForm
                    draft={editDraft}
                    onChange={setEditDraft}
                    products={products}
                    distributors={distributors}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-xl"
                      disabled={saving}
                      onClick={() => handleUpdate(plan.id)}
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Salvando…" : "Salvar"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[#191c1d] truncate">
                        {plan.name}
                      </p>
                      <Badge
                        variant={plan.is_active ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {plan.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {plan.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        Produto:{" "}
                        <strong className="text-foreground">
                          {plan.product.name}
                        </strong>
                      </span>
                      <span>
                        Entregas:{" "}
                        <strong className="text-foreground">
                          {plan.quantity}×
                        </strong>
                      </span>
                      <span>
                        Desconto:{" "}
                        <strong className="text-foreground">
                          {plan.discount_percentage}%
                        </strong>
                      </span>
                      <span>
                        Preço/entrega:{" "}
                        <strong className="text-foreground">
                          {formatCurrency(plan.unit_price_with_discount_cents)}
                        </strong>
                      </span>
                      <span>
                        Total:{" "}
                        <strong className="text-foreground">
                          {formatCurrency(
                            plan.unit_price_with_discount_cents * plan.quantity
                          )}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {plan.distributors.map((d) => (
                        <Badge
                          key={d.distributor_id}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {d.distributor.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title={plan.is_active ? "Desativar plano" : "Ativar plano"}
                      onClick={() => toggleActive(plan)}
                    >
                      {plan.is_active ? (
                        <ToggleRight className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Editar plano"
                      onClick={() => {
                        setEditId(plan.id);
                        setEditDraft(draftFromPlan(plan));
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
