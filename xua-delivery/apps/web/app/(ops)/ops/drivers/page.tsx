"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Link2, Mail, Pencil, Phone, Plus, Save, Truck, UserCog, X } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * GET /api/distributor/drivers/all — painel de gestão completa (role ops).
 * Diferente de GET /api/distributor/drivers (usado pela distribuidora), este
 * endpoint devolve TODOS os motoristas do sistema, incluindo órfãos
 * (`distributor: null`), com o objeto da distribuidora vinculada.
 */
interface DriverListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  distributor_id: string | null;
  distributor: { id: string; name: string } | null;
}

interface DistributorOption {
  id: string;
  name: string;
}

interface CreateDraft {
  name: string;
  email: string;
  phone: string;
  password: string;
  distributor_id: string;
}

const EMPTY_CREATE_DRAFT: CreateDraft = {
  name: "",
  email: "",
  phone: "",
  password: "",
  distributor_id: "",
};

interface EditDraft {
  name: string;
  phone: string;
}

function draftFromDriver(d: DriverListItem): EditDraft {
  return { name: d.name, phone: d.phone ?? "" };
}

function validateCreate(d: CreateDraft): string | null {
  if (!d.name.trim()) return "Informe o nome do motorista";
  if (!d.email.trim()) return "Informe o e-mail do motorista";
  if (!d.password || d.password.length < 8) return "A senha deve ter ao menos 8 caracteres";
  if (!d.distributor_id) return "Selecione a distribuidora";
  return null;
}

function editDraftToPayload(d: EditDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (d.name.trim()) payload.name = d.name.trim();
  if (d.phone.trim()) payload.phone = d.phone.trim();
  return payload;
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

function DistributorSelect({
  value,
  onChange,
  distributors,
  placeholder = "Selecione a distribuidora…",
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  distributors: DistributorOption[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"}
    >
      <option value="">{placeholder}</option>
      {distributors.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

/** Card com edição inline (nome, telefone, ativo/inativo) e, para órfãos, vínculo a uma distribuidora. */
function DriverCard({
  driver,
  distributors,
  isEditing,
  editDraft,
  saving,
  onStartEdit,
  onChangeEditDraft,
  onSave,
  onCancelEdit,
  onToggleActive,
  onLink,
}: {
  driver: DriverListItem;
  distributors: DistributorOption[];
  isEditing: boolean;
  editDraft: EditDraft;
  saving: boolean;
  onStartEdit: () => void;
  onChangeEditDraft: (d: EditDraft) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  onLink: (distributorId: string) => void;
}) {
  const [linkSelection, setLinkSelection] = useState("");
  const [linking, setLinking] = useState(false);
  const isOrphan = !driver.distributor;

  async function handleLinkClick() {
    if (!linkSelection) {
      toast.error("Selecione uma distribuidora");
      return;
    }
    setLinking(true);
    try {
      await onLink(linkSelection);
    } finally {
      setLinking(false);
    }
  }

  return (
    <div
      className={`rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3 ${
        isOrphan ? "border border-amber-200" : ""
      } ${driver.is_active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isOrphan ? "bg-amber-100" : "bg-[#5697E9]/15"
            }`}
          >
            <UserCog className={`h-5 w-5 ${isOrphan ? "text-amber-600" : "text-[#5697E9]"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold font-heading leading-tight truncate">{driver.name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3 shrink-0" />
                {driver.email}
              </span>
              {driver.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0" />
                  {driver.phone}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
              {driver.distributor ? driver.distributor.name : "Sem distribuidora vinculada"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={driver.is_active ? "bg-primary text-white" : "bg-[#e1e3e4] text-muted-foreground"}>
            {driver.is_active ? "Ativo" : "Inativo"}
          </Badge>
          {isOrphan && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Órfão</Badge>}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-4 pt-3 border-t border-[#e4e8f1]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" hint="Em branco = manter atual">
              <Input
                value={editDraft.name}
                onChange={(e) => onChangeEditDraft({ ...editDraft, name: e.target.value })}
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
            <Field label="Telefone" hint="Em branco = manter atual">
              <Input
                value={editDraft.phone}
                onChange={(e) => onChangeEditDraft({ ...editDraft, phone: e.target.value })}
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={saving}
              onClick={onSave}
              className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
            >
              <Save className="mr-1 h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={onCancelEdit}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            className="h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
            onClick={onStartEdit}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Editar
          </Button>
          <Button
            size="sm"
            className={
              driver.is_active
                ? "h-7 text-xs rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                : "h-7 text-xs rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none"
            }
            variant={driver.is_active ? "ghost" : "default"}
            onClick={onToggleActive}
          >
            {driver.is_active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      )}

      {isOrphan && !isEditing && (
        <div className="flex gap-2 pt-1 border-t border-amber-100 mt-1">
          <DistributorSelect
            value={linkSelection}
            onChange={setLinkSelection}
            distributors={distributors}
            className="min-w-0 flex-1 rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm mt-2"
          />
          <Button
            size="sm"
            disabled={linking}
            onClick={handleLinkClick}
            className="mt-2 shrink-0 rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
          >
            <Link2 className="mr-1 h-4 w-4" />
            {linking ? "Vinculando..." : "Vincular"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OpsDriversPage() {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ ...EMPTY_CREATE_DRAFT });
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: "", phone: "" });

  const [onlyOrphans, setOnlyOrphans] = useState(false);

  function loadAll() {
    return Promise.all([
      fetch("/api/distributor/drivers/all")
        .then((r) => r.json())
        .then((data) => setDrivers(data.drivers ?? [])),
      fetch("/api/distributor/all")
        .then((r) => r.json())
        .then((data) =>
          setDistributors(
            (data.distributors ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
          )
        ),
    ]);
  }

  useEffect(() => {
    loadAll()
      .catch(() => toast.error("Erro ao carregar motoristas"))
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
      const res = await fetch("/api/distributor/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          email: createDraft.email.trim(),
          phone: createDraft.phone.trim() || undefined,
          password: createDraft.password,
          distributor_id: createDraft.distributor_id,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao cadastrar motorista"));
      await loadAll();
      setCreateDraft({ ...EMPTY_CREATE_DRAFT });
      setCreating(false);
      toast.success("Motorista cadastrado e vinculado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar motorista");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    const payload = editDraftToPayload(editDraft);
    if (Object.keys(payload).length === 0) {
      toast.error("Preencha ao menos um campo para atualizar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/distributor/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao atualizar motorista"));
      await loadAll();
      setEditId(null);
      toast.success("Motorista atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar motorista");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(driver: DriverListItem) {
    const nextActive = !driver.is_active;
    try {
      const res = await fetch(`/api/distributor/drivers/${driver.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      if (!res.ok)
        throw new Error(
          await extractError(res, nextActive ? "Erro ao ativar motorista" : "Erro ao desativar motorista")
        );
      await loadAll();
      toast.success(nextActive ? "Motorista ativado" : "Motorista desativado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status do motorista");
    }
  }

  async function handleLink(driver: DriverListItem, distributorId: string) {
    try {
      const res = await fetch(`/api/distributor/drivers/${driver.id}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distributor_id: distributorId }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao vincular motorista"));
      await loadAll();
      toast.success(`${driver.name} vinculado com sucesso`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao vincular motorista");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Motoristas</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  const visibleDrivers = onlyOrphans ? drivers.filter((d) => !d.distributor) : drivers;
  const orphanCount = drivers.filter((d) => !d.distributor).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Motoristas</h1>
          <p className="text-xs text-muted-foreground">
            Gestão completa de motoristas de todas as distribuidoras
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
            Novo
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-2xl bg-white/95 p-5 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-heading">Novo motorista</p>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome *">
              <Input
                value={createDraft.name}
                onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
                placeholder="Nome completo"
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
            <Field label="E-mail *">
              <Input
                type="email"
                value={createDraft.email}
                onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })}
                placeholder="motorista@exemplo.com"
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={createDraft.phone}
                onChange={(e) => setCreateDraft({ ...createDraft, phone: e.target.value })}
                placeholder="(11) 98888-7777"
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
            <Field label="Senha inicial *" hint="Mínimo 8 caracteres. O motorista pode trocar depois.">
              <Input
                type="password"
                value={createDraft.password}
                onChange={(e) => setCreateDraft({ ...createDraft, password: e.target.value })}
                placeholder="••••••••"
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
            <Field label="Distribuidora *" hint="Motorista já é criado vinculado a esta distribuidora">
              <DistributorSelect
                value={createDraft.distributor_id}
                onChange={(id) => setCreateDraft({ ...createDraft, distributor_id: id })}
                distributors={distributors}
              />
            </Field>
          </div>
          <Button
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none font-semibold"
          >
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Salvando..." : "Cadastrar motorista"}
          </Button>
        </div>
      )}

      {orphanCount > 0 && (
        <button
          type="button"
          onClick={() => setOnlyOrphans((v) => !v)}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
            onlyOrphans
              ? "bg-amber-100 text-amber-700"
              : "bg-white/95 text-muted-foreground shadow-[0_2px_12px_rgba(0,26,64,0.06)] hover:text-foreground"
          }`}
        >
          {onlyOrphans
            ? `Mostrando apenas órfãos (${orphanCount})`
            : `${orphanCount} motorista(s) sem distribuidora — filtrar`}
        </button>
      )}

      <div className="space-y-3">
        {visibleDrivers.map((driver) => (
          <DriverCard
            key={driver.id}
            driver={driver}
            distributors={distributors}
            isEditing={editId === driver.id}
            editDraft={editDraft}
            saving={saving}
            onStartEdit={() => {
              setEditId(driver.id);
              setEditDraft(draftFromDriver(driver));
              setCreating(false);
            }}
            onChangeEditDraft={setEditDraft}
            onSave={() => handleUpdate(driver.id)}
            onCancelEdit={() => setEditId(null)}
            onToggleActive={() => handleToggleActive(driver)}
            onLink={(distributorId) => handleLink(driver, distributorId)}
          />
        ))}

        {visibleDrivers.length === 0 && !creating && (
          <div className="rounded-2xl bg-white/95 px-6 py-10 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5697E9]/15">
              <Truck className="h-7 w-7 text-[#5697E9]" />
            </div>
            <h2 className="mt-3 text-sm font-semibold font-heading text-foreground">
              Nenhum motorista cadastrado
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre o primeiro motorista e vincule a uma distribuidora.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
