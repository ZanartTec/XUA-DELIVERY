"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Building2, Pencil, Plus, Save, ShieldCheck, Truck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * GET /api/distributor/all chama `findAllForOps()` e devolve TODAS as
 * distribuidoras (ativas e inativas) com o select completo usado pelo CRUD
 * de ops. Distinto do endpoint consumido pelo seletor de
 * ops/subscription-plans, que ainda filtra apenas ativas.
 */
interface DistributorListItem {
  id: string;
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  acceptance_sla_seconds: number | null;
  allows_consumer_choice: boolean;
  is_active: boolean;
  mp_connected: boolean;
}

/** Campos editáveis comuns entre criação e edição. */
interface DistributorCoreDraft {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  acceptance_sla_seconds: string;
  allows_consumer_choice: boolean;
}

interface CreateDraft extends DistributorCoreDraft {
  admin_name: string;
  admin_email: string;
  admin_phone: string;
  admin_password: string;
}

const EMPTY_CREATE_DRAFT: CreateDraft = {
  name: "",
  cnpj: "",
  phone: "",
  email: "",
  acceptance_sla_seconds: "",
  allows_consumer_choice: true,
  admin_name: "",
  admin_email: "",
  admin_phone: "",
  admin_password: "",
};

type EditDraft = DistributorCoreDraft;

const EMPTY_EDIT_DRAFT: EditDraft = {
  name: "",
  cnpj: "",
  phone: "",
  email: "",
  acceptance_sla_seconds: "",
  allows_consumer_choice: true,
};

/** Preenche o formulário de edição com os valores reais da distribuidora. */
function draftFromDistributor(d: DistributorListItem): EditDraft {
  return {
    name: d.name,
    cnpj: d.cnpj,
    phone: d.phone,
    email: d.email,
    acceptance_sla_seconds:
      d.acceptance_sla_seconds != null ? String(d.acceptance_sla_seconds) : "",
    allows_consumer_choice: d.allows_consumer_choice,
  };
}

function coreDraftToPayload(d: DistributorCoreDraft) {
  return {
    name: d.name.trim(),
    cnpj: d.cnpj.trim(),
    phone: d.phone.trim(),
    email: d.email.trim(),
    acceptance_sla_seconds: d.acceptance_sla_seconds
      ? Number(d.acceptance_sla_seconds)
      : undefined,
    allows_consumer_choice: d.allows_consumer_choice,
  };
}

function createDraftToPayload(d: CreateDraft) {
  return {
    ...coreDraftToPayload(d),
    admin_name: d.admin_name.trim(),
    admin_email: d.admin_email.trim(),
    admin_phone: d.admin_phone.trim(),
    admin_password: d.admin_password,
  };
}

function validateCoreDraft(d: DistributorCoreDraft): string | null {
  if (!d.name.trim()) return "Informe o nome da distribuidora";
  if (!d.cnpj.trim()) return "Informe o CNPJ";
  if (!d.phone.trim()) return "Informe o telefone";
  if (!d.email.trim()) return "Informe o e-mail";
  return null;
}

function validateCreate(d: CreateDraft): string | null {
  const coreErr = validateCoreDraft(d);
  if (coreErr) return coreErr;
  if (!d.admin_name.trim()) return "Informe o nome do administrador";
  if (!d.admin_email.trim()) return "Informe o e-mail do administrador";
  if (!d.admin_phone.trim()) return "Informe o telefone do administrador";
  if (!d.admin_password || d.admin_password.length < 8)
    return "A senha do administrador deve ter ao menos 8 caracteres";
  return null;
}

async function extractError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#5697E9]/10">
        <Icon className="h-3.5 w-3.5 text-[#5697E9]" />
      </div>
      <p className="text-xs font-semibold font-heading text-foreground">{title}</p>
    </div>
  );
}

/** Campos compartilhados entre o formulário de criação e o de edição. */
function CoreFields<T extends DistributorCoreDraft>({
  draft,
  onChange,
}: {
  draft: T;
  onChange: (d: T) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome *">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Ex: Distribuidora São Luiz"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="CNPJ *">
        <Input
          value={draft.cnpj}
          onChange={(e) => onChange({ ...draft, cnpj: e.target.value })}
          placeholder="00.000.000/0000-00"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="Telefone *">
        <Input
          value={draft.phone}
          onChange={(e) => onChange({ ...draft, phone: e.target.value })}
          placeholder="(11) 98888-7777"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="E-mail *">
        <Input
          type="email"
          value={draft.email}
          onChange={(e) => onChange({ ...draft, email: e.target.value })}
          placeholder="contato@distribuidora.com"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="SLA de aceite (segundos)" hint="Tempo máximo para aceitar um pedido novo. Padrão do sistema se vazio.">
        <Input
          type="number"
          min="1"
          value={draft.acceptance_sla_seconds}
          onChange={(e) => onChange({ ...draft, acceptance_sla_seconds: e.target.value })}
          placeholder="Ex: 300"
          className="rounded-xl border-[#d9dde3] text-sm"
        />
      </Field>
      <Field label="Escolha de distribuidora pelo consumidor" hint="Se o consumidor pode escolher esta distribuidora manualmente no checkout">
        <select
          value={draft.allows_consumer_choice ? "sim" : "nao"}
          onChange={(e) => onChange({ ...draft, allows_consumer_choice: e.target.value === "sim" })}
          className="w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"
        >
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      </Field>
    </div>
  );
}

function CreateForm({ draft, onChange }: { draft: CreateDraft; onChange: (d: CreateDraft) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionHeader icon={Building2} title="Dados da distribuidora" />
        <div className="mt-3">
          <CoreFields draft={draft} onChange={onChange} />
        </div>
      </div>

      <div>
        <SectionHeader icon={UserPlus} title="Primeiro administrador" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nome *">
            <Input
              value={draft.admin_name}
              onChange={(e) => onChange({ ...draft, admin_name: e.target.value })}
              placeholder="Nome completo"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          <Field label="E-mail *">
            <Input
              type="email"
              value={draft.admin_email}
              onChange={(e) => onChange({ ...draft, admin_email: e.target.value })}
              placeholder="admin@distribuidora.com"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          <Field label="Telefone *">
            <Input
              value={draft.admin_phone}
              onChange={(e) => onChange({ ...draft, admin_phone: e.target.value })}
              placeholder="(11) 98888-6666"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          <Field label="Senha inicial *" hint="Mínimo 8 caracteres. O admin pode trocar depois.">
            <Input
              type="password"
              value={draft.admin_password}
              onChange={(e) => onChange({ ...draft, admin_password: e.target.value })}
              placeholder="••••••••"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OpsDistributorsPage() {
  const [distributors, setDistributors] = useState<DistributorListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ ...EMPTY_CREATE_DRAFT });
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ ...EMPTY_EDIT_DRAFT });

  function loadDistributors() {
    return fetch("/api/distributor/all")
      .then((r) => r.json())
      .then((data) => setDistributors(data.distributors ?? []));
  }

  useEffect(() => {
    loadDistributors()
      .catch(() => toast.error("Erro ao carregar distribuidoras"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    const err = validateCreate(createDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/distributor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDraftToPayload(createDraft)),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao criar distribuidora"));
      await loadDistributors();
      setCreateDraft({ ...EMPTY_CREATE_DRAFT });
      setCreating(false);
      toast.success("Distribuidora e administrador criados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar distribuidora");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    const err = validateCoreDraft(editDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/distributor/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coreDraftToPayload(editDraft)),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao atualizar distribuidora"));
      await loadDistributors();
      setEditId(null);
      toast.success("Distribuidora atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar distribuidora");
    } finally {
      setSaving(false);
    }
  }

  /** Ativa/desativa — a listagem já inclui inativas, então não precisa de estado paralelo em memória. */
  async function handleToggleActive(distributor: DistributorListItem) {
    const nextActive = !distributor.is_active;
    try {
      const res = await fetch(`/api/distributor/${distributor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      if (!res.ok)
        throw new Error(
          await extractError(
            res,
            nextActive ? "Erro ao reativar distribuidora" : "Erro ao desativar distribuidora"
          )
        );
      await loadDistributors();
      toast.success(nextActive ? "Distribuidora reativada" : "Distribuidora desativada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status da distribuidora");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Distribuidoras</h1>
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Distribuidoras</h1>
          <p className="text-xs text-muted-foreground">
            Cadastro de distribuidoras e do primeiro administrador de cada uma
          </p>
        </div>
        {!creating && (
          <Button
            size="sm"
            className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
            onClick={() => {
              setCreating(true);
              setEditId(null);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nova
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-2xl bg-white/95 p-5 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-heading">Nova distribuidora</p>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateDraft({ ...EMPTY_CREATE_DRAFT });
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <CreateForm draft={createDraft} onChange={setCreateDraft} />
          <Button
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
          >
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Salvando..." : "Criar distribuidora"}
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {distributors.map((distributor) => {
          const isEditing = editId === distributor.id;
          return (
            <div
              key={distributor.id}
              className={`rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3 ${
                distributor.is_active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5697E9]/15">
                    <Building2 className="h-5 w-5 text-[#5697E9]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading leading-tight truncate">
                      {distributor.name}
                    </p>
                    {distributor.mp_connected && (
                      <p className="flex items-center gap-1 text-[10px] text-emerald-600">
                        <ShieldCheck className="h-3 w-3" />
                        Gateway Mercado Pago conectado
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  className={
                    distributor.is_active
                      ? "bg-primary text-white shrink-0"
                      : "bg-[#e1e3e4] text-muted-foreground shrink-0"
                  }
                >
                  {distributor.is_active ? "Ativa" : "Inativa"}
                </Badge>
              </div>

              {isEditing ? (
                <div className="space-y-4 pt-3 border-t border-[#e4e8f1]">
                  <CoreFields draft={editDraft} onChange={setEditDraft} />
                  <div className="flex gap-2">
                    <Button
                      disabled={saving}
                      onClick={() => handleUpdate(distributor.id)}
                      className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      {saving ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEditId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                    onClick={() => {
                      setEditId(distributor.id);
                      setEditDraft(draftFromDistributor(distributor));
                      setCreating(false);
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  {distributor.is_active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleToggleActive(distributor)}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 text-xs rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none"
                      onClick={() => handleToggleActive(distributor)}
                    >
                      Reativar
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {distributors.length === 0 && !creating && (
          <div className="rounded-2xl bg-white/95 px-6 py-10 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5697E9]/15">
              <Truck className="h-7 w-7 text-[#5697E9]" />
            </div>
            <h2 className="mt-3 text-sm font-semibold font-heading text-foreground">
              Nenhuma distribuidora cadastrada
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie a primeira distribuidora e seu administrador inicial.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
