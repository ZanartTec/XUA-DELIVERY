"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Mail, MoreVertical, Pencil, Phone, Plus, Power, Search, UserCog } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { MaskedInput } from "@/src/components/shared/masked-input";
import { PageHeader } from "@/src/components/shared/page-header";
import { PasswordInput } from "@/src/components/shared/password-input";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { formatPhone, onlyDigits, phoneHref } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

/**
 * GET /api/distributor/drivers/all — todos os motoristas do sistema, inclusive
 * os sem distribuidora (`distributor: null`).
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
  is_active?: boolean;
}

interface CreateDraft {
  name: string;
  email: string;
  phone: string;
  password: string;
  distributor_id: string;
}

const EMPTY_CREATE_DRAFT: CreateDraft = { name: "", email: "", phone: "", password: "", distributor_id: "" };

type Filter = "all" | "orphans" | "inactive";

type DialogState =
  | { kind: "new" }
  | { kind: "edit"; driver: DriverListItem }
  | { kind: "link"; driver: DriverListItem }
  | null;

function validateCreate(d: CreateDraft): string | null {
  if (!d.name.trim()) return "Informe o nome do motorista";
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return "Informe um e-mail válido";
  if (d.phone && onlyDigits(d.phone).length < 10) return "Telefone incompleto";
  if (!d.password || d.password.length < 8) return "A senha precisa de ao menos 8 caracteres";
  if (!d.distributor_id) return "Escolha a distribuidora";
  return null;
}

async function extractError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.error?.message === "string") return body.error.message;
  return fallback;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function DistributorSelect({
  value,
  onChange,
  distributors,
}: {
  value: string;
  onChange: (id: string) => void;
  distributors: DistributorOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-full rounded-xl" aria-label="Distribuidora">
        <SelectValue placeholder="Escolha a distribuidora" />
      </SelectTrigger>
      <SelectContent>
        {distributors.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function OpsDriversPage() {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [dialog, setDialog] = useState<DialogState>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ ...EMPTY_CREATE_DRAFT });
  const [editDraft, setEditDraft] = useState({ name: "", phone: "" });
  const [linkTarget, setLinkTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<DriverListItem | null>(null);

  function loadAll() {
    return Promise.all([
      fetch("/api/distributor/drivers/all")
        .then((r) => r.json())
        .then((data) => setDrivers(data.drivers ?? [])),
      fetch("/api/distributor/all")
        .then((r) => r.json())
        .then((data) =>
          setDistributors(
            (data.distributors ?? [])
              .filter((d: DistributorOption) => d.is_active !== false)
              .map((d: DistributorOption) => ({ id: d.id, name: d.name })),
          ),
        ),
    ]);
  }

  useEffect(() => {
    loadAll()
      .catch(() => toast.error("Erro ao carregar motoristas"))
      .finally(() => setLoading(false));
  }, []);

  function openDialog(next: Exclude<DialogState, null>) {
    if (next.kind === "new") setCreateDraft({ ...EMPTY_CREATE_DRAFT });
    if (next.kind === "edit") setEditDraft({ name: next.driver.name, phone: next.driver.phone ?? "" });
    if (next.kind === "link") setLinkTarget(next.driver.distributor_id ?? "");
    setDialog(next);
  }

  async function send(url: string, method: "POST" | "PATCH", body: unknown, fallback: string) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await extractError(res, fallback));
  }

  async function handleSave() {
    if (!dialog) return;
    let request: () => Promise<void>;
    let success: string;

    if (dialog.kind === "new") {
      const err = validateCreate(createDraft);
      if (err) return void toast.error(err);
      request = () =>
        send("/api/distributor/drivers", "POST", {
          name: createDraft.name.trim(),
          email: createDraft.email.trim(),
          phone: onlyDigits(createDraft.phone) || undefined,
          password: createDraft.password,
          distributor_id: createDraft.distributor_id,
        }, "Erro ao cadastrar motorista");
      success = "Motorista cadastrado";
    } else if (dialog.kind === "edit") {
      if (!editDraft.name.trim()) return void toast.error("Informe o nome");
      if (editDraft.phone && onlyDigits(editDraft.phone).length < 10) return void toast.error("Telefone incompleto");
      request = () =>
        send(`/api/distributor/drivers/${dialog.driver.id}`, "PATCH", {
          name: editDraft.name.trim(),
          ...(editDraft.phone ? { phone: onlyDigits(editDraft.phone) } : {}),
        }, "Erro ao atualizar motorista");
      success = "Motorista atualizado";
    } else {
      if (!linkTarget) return void toast.error("Escolha a distribuidora");
      request = () =>
        send(`/api/distributor/drivers/${dialog.driver.id}/link`, "PATCH", { distributor_id: linkTarget }, "Erro ao vincular motorista");
      success = `${dialog.driver.name} agora atende ${distributors.find((d) => d.id === linkTarget)?.name ?? "a distribuidora"}`;
    }

    setSaving(true);
    try {
      await request();
      await loadAll();
      setDialog(null);
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(driver: DriverListItem, isActive: boolean) {
    try {
      await send(`/api/distributor/drivers/${driver.id}`, "PATCH", { is_active: isActive }, "Erro ao alterar status");
      await loadAll();
      toast.success(isActive ? "Motorista reativado" : "Motorista desativado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status do motorista");
    }
  }

  const orphanCount = drivers.filter((d) => !d.distributor).length;
  const inactiveCount = drivers.filter((d) => !d.is_active).length;
  const term = search.trim().toLowerCase();
  const digits = onlyDigits(search);
  const visible = drivers
    .filter((d) => (filter === "orphans" ? !d.distributor : filter === "inactive" ? !d.is_active : true))
    .filter(
      (d) =>
        !term ||
        d.name.toLowerCase().includes(term) ||
        d.email.toLowerCase().includes(term) ||
        (d.distributor?.name ?? "").toLowerCase().includes(term) ||
        (digits.length >= 3 && onlyDigits(d.phone ?? "").includes(digits)),
    )
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));

  const dialogTitle =
    dialog?.kind === "new"
      ? "Novo motorista"
      : dialog?.kind === "edit"
        ? `Editar ${dialog.driver.name}`
        : dialog?.kind === "link"
          ? dialog.driver.distributor
            ? "Mudar distribuidora"
            : "Vincular a uma distribuidora"
          : "";

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Motoristas" description="Todos os motoristas da rede." sticky>
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, e-mail, telefone ou distribuidora"
              aria-label="Buscar motorista"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
            className="w-full"
          >
            <ToggleGroupItem value="all" className="h-9 flex-1">Todos</ToggleGroupItem>
            <ToggleGroupItem value="orphans" className="h-9 flex-1">Sem vínculo{orphanCount ? ` (${orphanCount})` : ""}</ToggleGroupItem>
            <ToggleGroupItem value="inactive" className="h-9 flex-1">Inativos{inactiveCount ? ` (${inactiveCount})` : ""}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PageHeader>

      <div className="space-y-3 px-4 pb-4">
        {!loading && orphanCount > 0 && filter !== "orphans" ? (
          <Alert className="border-warning/40 bg-warning/10">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground">
              <span>
                {orphanCount === 1 ? "1 motorista está" : `${orphanCount} motoristas estão`} sem distribuidora e não recebem rotas.
              </span>
              <Button variant="soft" size="sm" onClick={() => setFilter("orphans")}>
                Ver
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <Skeleton className="h-56 rounded-2xl" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={term || filter !== "all" ? "Nenhum motorista encontrado" : "Nenhum motorista cadastrado"}
          />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {visible.map((d) => (
              <li key={d.id} className={cn("flex items-center gap-3 px-4 py-3", !d.is_active && "bg-surface-low")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-sm font-semibold text-primary">
                  {d.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-semibold", d.is_active ? "text-foreground" : "text-muted-foreground")}>{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[d.email, d.phone ? formatPhone(d.phone) : null].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.distributor ? (
                      <StatusBadge label={d.distributor.name} tone="info" className="h-5 px-2 text-[11px]" />
                    ) : (
                      <StatusBadge label="Sem distribuidora" tone="warning" className="h-5 px-2 text-[11px]" />
                    )}
                    {!d.is_active ? <StatusBadge label="Inativo" tone="neutral" className="h-5 px-2 text-[11px]" /> : null}
                  </div>
                </div>
                {!d.distributor ? (
                  <Button variant="soft" size="sm" className="hidden sm:inline-flex" onClick={() => openDialog({ kind: "link", driver: d })}>
                    <Link2 aria-hidden /> Vincular
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-touch" aria-label={`Ações de ${d.name}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => openDialog({ kind: "edit", driver: d })}>
                      <Pencil /> Editar dados
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openDialog({ kind: "link", driver: d })}>
                      <Link2 /> {d.distributor ? "Mudar distribuidora" : "Vincular a distribuidora"}
                    </DropdownMenuItem>
                    {d.phone ? (
                      <DropdownMenuItem asChild>
                        <a href={phoneHref(d.phone) ?? undefined}>
                          <Phone /> Ligar
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem asChild>
                      <a href={`mailto:${d.email}`}>
                        <Mail /> Enviar e-mail
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {d.is_active ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(d)}>
                        <Power /> Desativar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => setActive(d, true)}>
                        <Power /> Reativar
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
        <Button variant="cta" size="xl" onClick={() => openDialog({ kind: "new" })}>
          <Plus aria-hidden /> Novo motorista
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialogTitle}
        description={
          dialog?.kind === "new"
            ? "O motorista entra com este e-mail e senha no app."
            : dialog?.kind === "link"
              ? `${dialog.driver.name} passa a receber as rotas da distribuidora escolhida.`
              : undefined
        }
        footer={
          <Button variant="cta" size="xl" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {dialog?.kind === "new" ? "Cadastrar motorista" : dialog?.kind === "link" ? "Confirmar vínculo" : "Salvar alterações"}
          </Button>
        }
      >
        {dialog?.kind === "new" ? (
          <div className="space-y-4">
            <Field label="Nome">
              <Input value={createDraft.name} onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })} autoComplete="off" className="h-11 rounded-xl" />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={createDraft.email} onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })} autoComplete="off" className="h-11 rounded-xl" />
            </Field>
            <Field label="Telefone" hint="Opcional. A distribuidora usa para falar com ele na rota.">
              <MaskedInput mask="phone" value={createDraft.phone} onValueChange={(v) => setCreateDraft({ ...createDraft, phone: v })} className="h-11 rounded-xl" />
            </Field>
            <Field label="Senha inicial" hint="Mínimo de 8 caracteres. Ele troca depois em Conta.">
              <PasswordInput value={createDraft.password} onChange={(e) => setCreateDraft({ ...createDraft, password: e.target.value })} autoComplete="new-password" className="h-11 rounded-xl" />
            </Field>
            <Field label="Distribuidora">
              <DistributorSelect value={createDraft.distributor_id} onChange={(id) => setCreateDraft({ ...createDraft, distributor_id: id })} distributors={distributors} />
            </Field>
          </div>
        ) : dialog?.kind === "edit" ? (
          <div className="space-y-4">
            <Field label="Nome">
              <Input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="h-11 rounded-xl" />
            </Field>
            <Field label="Telefone">
              <MaskedInput mask="phone" value={editDraft.phone} onValueChange={(v) => setEditDraft({ ...editDraft, phone: v })} className="h-11 rounded-xl" />
            </Field>
            <p className="text-xs text-muted-foreground">O e-mail de acesso não muda por aqui.</p>
          </div>
        ) : dialog?.kind === "link" ? (
          <Field label="Distribuidora">
            <DistributorSelect value={linkTarget} onChange={setLinkTarget} distributors={distributors} />
          </Field>
        ) : null}
      </ResponsiveDialog>

      <ConfirmAction
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Desativar ${deactivating?.name ?? ""}?`}
        description="Ele não consegue mais entrar no app nem receber rotas. Dá para reativar depois."
        confirmLabel="Desativar"
        destructive
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false);
          setDeactivating(null);
        }}
      />
    </div>
  );
}
