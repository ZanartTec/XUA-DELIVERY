"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DISTRIBUTOR_DRIVERS_KEY,
  useDistributorDrivers,
  type DistributorDriver,
} from "@/src/hooks/distributor/use-distributor-drivers";
import { MoreVertical, Pencil, Phone, Plus, Power, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { FormField } from "@/src/components/shared/form-field";
import { MaskedInput } from "@/src/components/shared/masked-input";
import { PageHeader } from "@/src/components/shared/page-header";
import { PasswordInput } from "@/src/components/shared/password-input";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { formatPhone, onlyDigits, phoneHref } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { DataView, type Column } from "@/src/components/shared/data-view";
import { Spinner } from "@/src/components/ui/spinner";

type Driver = DistributorDriver;

type FormState = { mode: "new" } | { mode: "edit"; driver: Driver } | null;

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível salvar");
  }
  return res.json();
}

export default function DistributorDriversPage() {
  const queryClient = useQueryClient();
  const query = useDistributorDrivers();
  const drivers = query.data ?? [];
  const active = drivers.filter((d) => d.is_active !== false);
  const inactive = drivers.filter((d) => d.is_active === false);

  const [form, setForm] = useState<FormState>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<Driver | null>(null);

  function openForm(next: FormState) {
    setForm(next);
    if (next?.mode === "edit") {
      setName(next.driver.name);
      setPhone(onlyDigits(next.driver.phone));
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
    }
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: DISTRIBUTOR_DRIVERS_KEY });

  async function submit() {
    if (!form) return;
    setSaving(true);
    try {
      if (form.mode === "new") {
        await send("/api/distributor/drivers", "POST", {
          name: name.trim(),
          email: email.trim(),
          phone: phone ? formatPhone(phone) : undefined,
          password,
        });
        toast.success("Motorista cadastrado. Passe o e-mail e a senha para ele entrar no app.");
      } else {
        await send(`/api/distributor/drivers/${form.driver.id}`, "PATCH", {
          name: name.trim(),
          ...(phone ? { phone: formatPhone(phone) } : {}),
        });
        toast.success("Dados do motorista atualizados");
      }
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(driver: Driver, isActive: boolean) {
    try {
      await send(`/api/distributor/drivers/${driver.id}`, "PATCH", { is_active: isActive });
      toast.success(isActive ? `${driver.name} reativado` : `${driver.name} desativado`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar o status");
    }
  }

  const canSubmit =
    name.trim().length >= 2 &&
    (form?.mode === "edit" || (/\S+@\S+\.\S+/.test(email) && password.length >= 8)) &&
    (!phone || phone.length >= 10);

  /** Ligar + menu de ações: mesma peça na linha do celular e na tabela do desktop. */
  const rowActions = (driver: Driver) => {
    const isActive = driver.is_active !== false;
    const tel = phoneHref(driver.phone);
    return (
      <>
        {tel && isActive ? (
          <Button asChild variant="ghost" size="icon-touch" aria-label={`Ligar para ${driver.name}`}>
            <a href={tel}>
              <Phone />
            </a>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-touch" aria-label={`Ações de ${driver.name}`}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => openForm({ mode: "edit", driver })}>
              <Pencil /> Editar
            </DropdownMenuItem>
            {isActive ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(driver)}>
                <Power /> Desativar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setActive(driver, true)}>
                <Power /> Reativar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  };

  const renderMobile = (driver: Driver) => {
    const isActive = driver.is_active !== false;
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10">
          <Truck className="size-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold", isActive ? "text-foreground" : "text-muted-foreground")}>{driver.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {driver.email ?? "—"}
            {driver.phone ? ` · ${formatPhone(driver.phone)}` : ""}
          </p>
        </div>
        {!isActive ? <StatusBadge label="Inativo" tone="neutral" className="h-5 px-2 text-[11px]" /> : null}
        {rowActions(driver)}
      </div>
    );
  };

  const columns: Column<Driver>[] = [
    {
      id: "name",
      header: "Motorista",
      cell: (driver) => (
        <span className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky/10">
            <Truck className="size-4 text-primary" aria-hidden />
          </span>
          <span className={cn("font-medium", driver.is_active === false ? "text-muted-foreground" : "text-foreground")}>
            {driver.name}
          </span>
        </span>
      ),
    },
    { id: "email", header: "E-mail", cell: (driver) => driver.email ?? "—", className: "text-muted-foreground" },
    {
      id: "phone",
      header: "Celular",
      cell: (driver) => (driver.phone ? formatPhone(driver.phone) : "—"),
      className: "text-muted-foreground tabular-nums",
    },
    {
      id: "status",
      header: "Situação",
      cell: (driver) =>
        driver.is_active === false ? (
          <StatusBadge label="Inativo" tone="neutral" className="h-5 px-2 text-[11px]" />
        ) : (
          <StatusBadge label="Ativo" tone="success" className="h-5 px-2 text-[11px]" />
        ),
    },
    {
      id: "actions",
      header: "",
      srLabel: "Ações",
      align: "right",
      className: "w-28",
      cell: (driver) => <span className="inline-flex items-center justify-end">{rowActions(driver)}</span>,
    },
  ];

  const inactiveRowClass = (driver: Driver) => (driver.is_active === false ? "bg-surface-low" : undefined);

  return (
    <div className="mx-auto w-full max-w-3xl md:max-w-6xl">
      <PageHeader
        title="Motoristas"
        description="Quem faz as entregas da sua distribuidora."
        actions={
          <Button variant="cta" size="lg" className="hidden md:inline-flex" onClick={() => openForm({ mode: "new" })}>
            <Plus aria-hidden /> Novo motorista
          </Button>
        }
      />
      <div className="space-y-5 px-4 pb-4">
        {query.isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : drivers.length === 0 ? (
          <EmptyState icon={Truck} title="Nenhum motorista cadastrado" description="Cadastre quem vai entregar para poder despachar pedidos." />
        ) : (
          <>
            <DataView
              label="Motoristas ativos"
              items={active}
              getKey={(driver) => driver.id}
              columns={columns}
              renderMobile={renderMobile}
            />
            {inactive.length > 0 ? (
              <section aria-labelledby="sec-inativos" className="space-y-2">
                <h2 id="sec-inativos" className="text-sm font-semibold text-muted-foreground">
                  Desativados
                </h2>
                <DataView
                  label="Motoristas desativados"
                  items={inactive}
                  getKey={(driver) => driver.id}
                  columns={columns}
                  renderMobile={renderMobile}
                  rowClassName={inactiveRowClass}
                />
              </section>
            ) : null}
          </>
        )}
      </div>

      <StickyActionBar mobileOnly>
        <Button variant="cta" size="xl" onClick={() => openForm({ mode: "new" })}>
          <Plus aria-hidden /> Novo motorista
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={form?.mode === "edit" ? "Editar motorista" : "Novo motorista"}
        description={form?.mode === "new" ? "Ele usa o e-mail e a senha para entrar no app do motorista." : undefined}
        footer={
          <Button variant="cta" size="xl" disabled={!canSubmit || saving} onClick={submit}>
            {saving ? <Spinner aria-hidden /> : null}
            {form?.mode === "edit" ? "Salvar" : "Cadastrar motorista"}
          </Button>
        }
      >
        <div className="grid gap-4">
          <FormField label="Nome">
            {(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-11 md:h-9" />}
          </FormField>
          {form?.mode === "new" ? (
            <FormField label="E-mail">
              {(f) => <Input {...f} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-11 md:h-9" />}
            </FormField>
          ) : null}
          <FormField label="Celular" optional>
            {(f) => <MaskedInput {...f} mask="phone" value={phone} onValueChange={setPhone} placeholder="(00) 00000-0000" className="h-11 md:h-9" />}
          </FormField>
          {form?.mode === "new" ? (
            <FormField label="Senha inicial" hint="Mínimo de 8 caracteres. Ele pode trocar em Conta.">
              {(f) => <PasswordInput {...f} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11 md:h-9" />}
            </FormField>
          ) : null}
        </div>
      </ResponsiveDialog>

      <ConfirmAction
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Desativar ${deactivating?.name ?? "motorista"}?`}
        description="Ele não consegue mais entrar no app nem receber entregas. Você pode reativar depois."
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
