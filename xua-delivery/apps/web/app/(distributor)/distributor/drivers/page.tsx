"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Pencil, Plus, Save, Truck, UserCog, X } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * GET /api/distributor/drivers é o mesmo endpoint usado no seletor de
 * despacho (distributor/queue) e hoje retorna apenas {id, name}. `email`,
 * `phone` e `is_active` só chegam depois de criar/editar o motorista nesta
 * tela (a resposta do POST/PATCH traz o registro completo).
 */
interface DriverListItem {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  is_active?: boolean;
}

interface CreateDraft {
  name: string;
  email: string;
  phone: string;
  password: string;
}

const EMPTY_CREATE_DRAFT: CreateDraft = { name: "", email: "", phone: "", password: "" };

interface EditDraft {
  name: string;
  phone: string;
}

const EMPTY_EDIT_DRAFT: EditDraft = { name: "", phone: "" };

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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DistributorDriversPage() {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ ...EMPTY_CREATE_DRAFT });
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ ...EMPTY_EDIT_DRAFT });

  function loadDrivers() {
    return fetch("/api/distributor/drivers")
      .then((r) => r.json())
      .then((data) => setDrivers(data.drivers ?? []));
  }

  useEffect(() => {
    loadDrivers()
      .catch(() => toast.error("Erro ao carregar motoristas"))
      .finally(() => setLoading(false));
  }, []);

  function validateCreate(d: CreateDraft): string | null {
    if (!d.name.trim()) return "Informe o nome do motorista";
    if (!d.email.trim()) return "Informe o e-mail do motorista";
    if (!d.password || d.password.length < 8) return "A senha deve ter ao menos 8 caracteres";
    return null;
  }

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
        }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao cadastrar motorista"));
      const driver = await res.json();
      setDrivers((prev) => [...prev, driver]);
      setCreateDraft({ ...EMPTY_CREATE_DRAFT });
      setCreating(false);
      toast.success("Motorista cadastrado");
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
      const driver = await res.json();
      setDrivers((prev) => prev.map((d) => (d.id === id ? { ...d, ...driver } : d)));
      setEditId(null);
      toast.success("Motorista atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar motorista");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(driver: DriverListItem, isActive: boolean) {
    try {
      const res = await fetch(`/api/distributor/drivers/${driver.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao alterar status do motorista"));
      const updated = await res.json();
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, ...updated } : d)));
      toast.success(isActive ? "Motorista ativado" : "Motorista desativado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status do motorista");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Motoristas</h1>
          <p className="text-xs text-muted-foreground">Motoristas da sua distribuidora</p>
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

      <div className="space-y-3">
        {drivers.map((driver) => {
          const isEditing = editId === driver.id;
          const isActive = driver.is_active !== false;

          return (
            <div
              key={driver.id}
              className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5697E9]/15">
                    <UserCog className="h-5 w-5 text-[#5697E9]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading leading-tight truncate">{driver.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {driver.email ?? "—"}
                      {driver.phone ? ` · ${driver.phone}` : ""}
                    </p>
                  </div>
                </div>
                <Badge className={isActive ? "bg-primary text-white shrink-0" : "shrink-0"} variant={isActive ? "default" : "secondary"}>
                  {isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>

              {isEditing ? (
                <div className="space-y-4 pt-3 border-t border-[#e4e8f1]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome" hint="Em branco = manter atual">
                      <Input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className="rounded-xl border-[#d9dde3] text-sm"
                      />
                    </Field>
                    <Field label="Telefone" hint="Em branco = manter atual">
                      <Input
                        value={editDraft.phone}
                        onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                        className="rounded-xl border-[#d9dde3] text-sm"
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={saving}
                      onClick={() => handleUpdate(driver.id)}
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
                      setEditId(driver.id);
                      setEditDraft({ ...EMPTY_EDIT_DRAFT, name: driver.name });
                      setCreating(false);
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    className={
                      isActive
                        ? "h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                        : "h-7 text-xs rounded-xl bg-[#00E0FF] text-[#001735] hover:bg-[#00E0FF]/90 shadow-none"
                    }
                    onClick={() => setActive(driver, !isActive)}
                  >
                    {isActive ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {drivers.length === 0 && !creating && (
          <div className="rounded-2xl bg-white/95 px-6 py-10 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5697E9]/15">
              <Truck className="h-7 w-7 text-[#5697E9]" />
            </div>
            <h2 className="mt-3 text-sm font-semibold font-heading text-foreground">
              Nenhum motorista cadastrado
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre o primeiro motorista da sua distribuidora.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
