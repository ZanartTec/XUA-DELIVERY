"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { PasswordInput } from "@/src/components/shared/password-input";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { formatPhone } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Building2, FileText, Loader2, MoreVertical, Pencil, Plus, Power, Search, UserPlus } from "lucide-react";
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
  legal_name: string | null;
  trade_name: string | null;
  state_registration: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

/** Dados do emitente impressos no comprovante de venda (todos opcionais). */
const ISSUER_FIELD_KEYS = [
  "legal_name",
  "trade_name",
  "state_registration",
  "zip_code",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
] as const;

type IssuerFieldKey = (typeof ISSUER_FIELD_KEYS)[number];
type IssuerDraft = Record<IssuerFieldKey, string>;

const EMPTY_ISSUER_DRAFT: IssuerDraft = {
  legal_name: "",
  trade_name: "",
  state_registration: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

/** Sem razão social ou endereço o comprovante sai só com o nome da distribuidora. */
function isIssuerIncomplete(d: DistributorListItem): boolean {
  return !d.legal_name || !d.street || !d.number || !d.city || !d.state || !d.zip_code;
}

/** Campos editáveis comuns entre criação e edição. */
interface DistributorCoreDraft {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  acceptance_sla_seconds: string;
  allows_consumer_choice: boolean;
  issuer: IssuerDraft;
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
  issuer: { ...EMPTY_ISSUER_DRAFT },
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
  issuer: { ...EMPTY_ISSUER_DRAFT },
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
    issuer: Object.fromEntries(
      ISSUER_FIELD_KEYS.map((key) => [key, d[key] ?? ""])
    ) as IssuerDraft,
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
    // String vazia é enviada de propósito: o backend converte em null (limpa o campo).
    ...Object.fromEntries(ISSUER_FIELD_KEYS.map((key) => [key, d.issuer[key].trim()])),
  };
}

/** Na edição, envia só o que mudou: dados antigos (ex.: CNPJ de cadastro legado) não travam outras alterações. */
function changedFields(original: DistributorListItem, draft: EditDraft) {
  const before = coreDraftToPayload(draftFromDistributor(original)) as Record<string, unknown>;
  const after = coreDraftToPayload(draft) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value));
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
  const zip = d.issuer.zip_code.replace(/\D/g, "");
  if (zip && zip.length !== 8) return "CEP do emitente inválido";
  if (d.issuer.state.trim() && !/^[A-Za-z]{2}$/.test(d.issuer.state.trim())) return "UF do emitente inválida";
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
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky/10">
        <Icon className="h-3.5 w-3.5 text-sky" />
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
      <Field label="Nome">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Ex: Distribuidora São Luiz"
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label="CNPJ">
        <Input
          value={draft.cnpj}
          onChange={(e) => onChange({ ...draft, cnpj: e.target.value })}
          placeholder="00.000.000/0000-00"
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label="Telefone">
        <Input
          value={draft.phone}
          onChange={(e) => onChange({ ...draft, phone: e.target.value })}
          placeholder="(11) 98888-7777"
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label="E-mail">
        <Input
          type="email"
          value={draft.email}
          onChange={(e) => onChange({ ...draft, email: e.target.value })}
          placeholder="contato@distribuidora.com"
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label="Prazo para aceitar pedido (minutos)" hint="A distribuidora vê esse prazo na fila e o indicador mede contra ele. Vazio = padrão do sistema (3 min).">
        <Input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={draft.acceptance_sla_seconds ? String(Math.round(Number(draft.acceptance_sla_seconds) / 60)) : ""}
          onChange={(e) =>
            onChange({ ...draft, acceptance_sla_seconds: e.target.value ? String(Math.max(1, Number(e.target.value)) * 60) : "" })
          }
          placeholder="Ex.: 5"
          className="h-11 rounded-xl"
        />
      </Field>
      <div className="flex items-start gap-3 rounded-xl border border-hairline p-3">
        <Switch
          id="allows-choice"
          checked={draft.allows_consumer_choice}
          onCheckedChange={(v) => onChange({ ...draft, allows_consumer_choice: v })}
        />
        <Label htmlFor="allows-choice" className="flex-col items-start gap-0.5">
          <span className="text-sm font-medium">Cliente pode escolher esta distribuidora</span>
          <span className="text-xs font-normal text-muted-foreground">Aparece como opção no checkout quando há mais de uma na região.</span>
        </Label>
      </div>
    </div>
  );
}

/** Dados do emitente do comprovante de venda, com preenchimento pelo CEP. */
function IssuerFields<T extends DistributorCoreDraft>({
  draft,
  onChange,
}: {
  draft: T;
  onChange: (d: T) => void;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const issuer = draft.issuer;
  // A busca de CEP é assíncrona: o usuário segue digitando (ex.: o número)
  // enquanto ela roda. O resultado precisa ser aplicado sobre o rascunho
  // mais recente, não sobre o capturado quando a busca começou.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  function setIssuer(patch: Partial<IssuerDraft>) {
    const current = latestDraft.current;
    onChange({ ...current, issuer: { ...current.issuer, ...patch } });
  }

  async function lookupCep() {
    const clean = issuer.zip_code.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`/api/distributor/cep/${clean}`);
      if (!res.ok) throw new Error(await extractError(res, "CEP não encontrado"));
      const data: { street: string; neighborhood: string; city: string; state: string } = await res.json();
      const current = latestDraft.current.issuer;
      setIssuer({
        zip_code: clean,
        street: data.street || current.street,
        neighborhood: data.neighborhood || current.neighborhood,
        city: data.city || current.city,
        state: data.state || current.state,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "CEP não encontrado");
    } finally {
      setCepLoading(false);
    }
  }

  const input = (key: IssuerFieldKey, placeholder: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Input
      value={issuer[key]}
      onChange={(e) => setIssuer({ [key]: e.target.value })}
      placeholder={placeholder}
      className="h-11 rounded-xl"
      {...extra}
    />
  );

  return (
    <div>
      <SectionHeader icon={FileText} title="Dados do emitente (comprovante de venda)" />
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        Impressos no comprovante entregue ao cliente. Sem razão social, o comprovante usa o nome da distribuidora.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Razão social">{input("legal_name", "Ex: São Luiz Comércio de Água Ltda")}</Field>
        <Field label="Nome fantasia">{input("trade_name", "Ex: Água São Luiz")}</Field>
        <Field label="Inscrição estadual" hint="Número ou ISENTO">{input("state_registration", "Ex: 123.456.789.110")}</Field>
        <Field label="CEP" hint={cepLoading ? "Buscando endereço..." : "Preenche rua, bairro, cidade e UF"}>
          <div className="relative">
            {input("zip_code", "00000-000", { onBlur: lookupCep, inputMode: "numeric" })}
            {cepLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </Field>
        <Field label="Rua">{input("street", "Ex: Rua das Flores")}</Field>
        <Field label="Número">{input("number", "Ex: 123")}</Field>
        <Field label="Complemento">{input("complement", "Ex: Galpão 2")}</Field>
        <Field label="Bairro">{input("neighborhood", "Ex: Centro")}</Field>
        <Field label="Cidade">{input("city", "Ex: São Paulo")}</Field>
        <Field label="UF">{input("state", "SP", { maxLength: 2 })}</Field>
      </div>
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

      <IssuerFields draft={draft} onChange={onChange} />

      <div>
        <SectionHeader icon={UserPlus} title="Primeiro administrador" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <Input
              value={draft.admin_name}
              onChange={(e) => onChange({ ...draft, admin_name: e.target.value })}
              placeholder="Nome completo"
              className="h-11 rounded-xl"
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={draft.admin_email}
              onChange={(e) => onChange({ ...draft, admin_email: e.target.value })}
              placeholder="admin@distribuidora.com"
              className="h-11 rounded-xl"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={draft.admin_phone}
              onChange={(e) => onChange({ ...draft, admin_phone: e.target.value })}
              placeholder="(11) 98888-6666"
              className="h-11 rounded-xl"
            />
          </Field>
          <Field label="Senha inicial" hint="Mínimo de 8 caracteres. O admin troca depois em Conta.">
            <PasswordInput
              value={draft.admin_password}
              onChange={(e) => onChange({ ...draft, admin_password: e.target.value })}
              autoComplete="new-password"
              className="h-11 rounded-xl"
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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ mode: "new" } | { mode: "edit"; distributor: DistributorListItem } | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ ...EMPTY_CREATE_DRAFT });
  const [editDraft, setEditDraft] = useState<EditDraft>({ ...EMPTY_EDIT_DRAFT });
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<DistributorListItem | null>(null);

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

  function openForm(next: { mode: "new" } | { mode: "edit"; distributor: DistributorListItem }) {
    if (next.mode === "edit") setEditDraft(draftFromDistributor(next.distributor));
    else setCreateDraft({ ...EMPTY_CREATE_DRAFT });
    setForm(next);
  }

  async function handleSave() {
    if (!form) return;
    const editing = form.mode === "edit";
    const err = editing ? validateCoreDraft(editDraft) : validateCreate(createDraft);
    if (err) {
      toast.error(err);
      return;
    }
    if (editing && Object.keys(changedFields(form.distributor, editDraft)).length === 0) {
      setForm(null);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/distributor/${form.distributor.id}` : "/api/distributor", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? changedFields(form.distributor, editDraft) : createDraftToPayload(createDraft)),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao salvar distribuidora"));
      await loadDistributors();
      setForm(null);
      toast.success(editing ? "Distribuidora atualizada" : "Distribuidora e administrador criados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar distribuidora");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(distributor: DistributorListItem, isActive: boolean) {
    try {
      const res = await fetch(`/api/distributor/${distributor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error(await extractError(res, "Erro ao alterar status"));
      await loadDistributors();
      toast.success(isActive ? "Distribuidora reativada" : "Distribuidora desativada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status da distribuidora");
    }
  }

  const term = search.trim().toLowerCase();
  const visible = distributors
    .filter((d) => !term || d.name.toLowerCase().includes(term) || d.cnpj.includes(term) || (d.city ?? "").toLowerCase().includes(term))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Distribuidoras" description="Quem atende os pedidos em cada região." sticky>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, CNPJ ou cidade" aria-label="Buscar distribuidora" className="h-11 rounded-xl pl-9" />
        </div>
      </PageHeader>

      <div className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : visible.length === 0 ? (
          <EmptyState icon={Building2} title={term ? "Nenhuma distribuidora encontrada" : "Nenhuma distribuidora cadastrada"} />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {visible.map((d) => (
              <li key={d.id} className={cn("flex items-center gap-3 px-4 py-3", !d.is_active && "bg-surface-low")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10">
                  <Building2 className="size-5 text-primary" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-semibold", d.is_active ? "text-foreground" : "text-muted-foreground")}>{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[d.city && d.state ? `${d.city}/${d.state}` : null, d.cnpj, d.phone ? formatPhone(d.phone) : null].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!d.is_active ? <StatusBadge label="Desativada" tone="neutral" className="h-5 px-2 text-[11px]" /> : null}
                    <StatusBadge label={d.mp_connected ? "Mercado Pago conectado" : "Sem Mercado Pago"} tone={d.mp_connected ? "success" : "neutral"} className="h-5 px-2 text-[11px]" />
                    {isIssuerIncomplete(d) ? <StatusBadge label="Dados do comprovante incompletos" tone="warning" className="h-5 px-2 text-[11px]" /> : null}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-touch" aria-label={`Ações de ${d.name}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => openForm({ mode: "edit", distributor: d })}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
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
        <Button variant="cta" size="xl" onClick={() => openForm({ mode: "new" })}>
          <Plus aria-hidden /> Nova distribuidora
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={form?.mode === "edit" ? `Editar ${form.distributor.name}` : "Nova distribuidora"}
        description={form?.mode === "new" ? "Cria a distribuidora e o primeiro acesso de administrador." : undefined}
        className="sm:max-w-2xl"
        footer={
          <Button variant="cta" size="xl" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {form?.mode === "edit" ? "Salvar alterações" : "Criar distribuidora"}
          </Button>
        }
      >
        {form?.mode === "edit" ? (
          <div className="space-y-5">
            <CoreFields draft={editDraft} onChange={setEditDraft} />
            <IssuerFields draft={editDraft} onChange={setEditDraft} />
          </div>
        ) : form ? (
          <CreateForm draft={createDraft} onChange={setCreateDraft} />
        ) : null}
      </ResponsiveDialog>

      <ConfirmAction
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Desativar ${deactivating?.name ?? ""}?`}
        description="Ela para de receber pedidos novos e some do checkout. Pedidos em andamento continuam. Dá para reativar depois."
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
