"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  HelpCircle,
  Info,
  KeyRound,
  LogOut,
  MapPin,
  Pencil,
  ReceiptText,
} from "lucide-react";
import { useAuthStore } from "@/src/store/auth";
import { normalizeUserRole } from "@/src/lib/role-utils";
import { usePwa } from "@/src/hooks/use-pwa";
import { useAddresses } from "@/src/hooks/consumer/use-addresses";
import { api, ApiError } from "@/src/lib/api-client";
import { formatPhone, plural } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { logout } from "@/src/components/shared/logout-button";
import { PwaIosInstructionsSheet } from "@/src/components/shared/pwa-ios-instructions-sheet";
import type { Consumer } from "@/src/types";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function MenuRow({
  icon: Icon,
  label,
  hint,
  href,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
  const className = "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted";
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

export default function ProfilePage() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const { data: addresses } = useAddresses();
  const { status: pwaStatus, canInstall, promptInstall } = usePwa();
  const [pwaIosSheetOpen, setPwaIosSheetOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ consumer: Consumer }>("/api/auth/me"),
  });
  const consumer = meQuery.data?.consumer ?? null;

  useEffect(() => {
    if (consumer) setUser({ id: consumer.id, name: consumer.name, role: normalizeUserRole(consumer.role, "consumer") });
  }, [consumer, setUser]);

  async function toggleAutoAssign(next: boolean) {
    if (!consumer) return;
    setAssignSaving(true);
    try {
      const updated = await api.patch<Consumer>(`/api/consumers/${consumer.id}/assign-mode`, {
        auto_assign_distributor: next,
      });
      queryClient.setQueryData(["me"], { consumer: { ...consumer, auto_assign_distributor: updated.auto_assign_distributor } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar a preferência.");
    } finally {
      setAssignSaving(false);
    }
  }

  if (meQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const addressCount = addresses?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-6 pb-6">
      {meQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar seu perfil.</AlertDescription>
        </Alert>
      ) : null}

      {/* Identificação compacta (antes o avatar ocupava 1/4 da tela) */}
      {consumer ? (
        <section className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-linear-to-br from-primary to-sky font-heading text-xl font-bold text-primary-foreground">
              {initials(consumer.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-xl font-bold text-ink">{consumer.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{consumer.email}</p>
            {consumer.phone ? <p className="text-sm text-muted-foreground">{formatPhone(consumer.phone)}</p> : null}
          </div>
          <Button asChild variant="ghost" size="icon-touch" aria-label="Editar perfil">
            <Link href="/profile/edit">
              <Pencil />
            </Link>
          </Button>
        </section>
      ) : null}

      <nav aria-label="Minha conta" className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
        <MenuRow icon={ReceiptText} label="Meus pedidos" href="/orders" />
        <MenuRow
          icon={MapPin}
          label="Meus endereços"
          hint={addressCount ? plural(addressCount, "endereço salvo", "endereços salvos") : "Cadastre onde quer receber"}
          href="/profile/addresses"
        />
        <MenuRow icon={Pencil} label="Dados pessoais" hint="Nome, e-mail e telefone" href="/profile/edit" />
        <MenuRow icon={KeyRound} label="Alterar senha" href="/profile/password" />
      </nav>

      {consumer ? (
        <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10 text-primary">
            <Building2 className="size-5" aria-hidden />
          </span>
          <Label htmlFor="auto-assign" className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5">
            <span className="text-sm font-semibold text-foreground">Distribuidora automática</span>
            <span className="text-xs font-normal text-muted-foreground">
              {consumer.auto_assign_distributor ? "O app escolhe a melhor para você" : "Você escolhe a cada pedido"}
            </span>
          </Label>
          <Switch
            id="auto-assign"
            checked={consumer.auto_assign_distributor}
            disabled={assignSaving}
            onCheckedChange={toggleAutoAssign}
          />
        </div>
      ) : null}

      <nav aria-label="Ajuda" className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
        <MenuRow icon={HelpCircle} label="Ajuda e suporte" hint="Perguntas frequentes e contato" href="/profile/help" />
        <MenuRow icon={Info} label="Sobre o Xuá" href="/profile/help#sobre" />
        {pwaStatus === "installed" ? (
          <div className="flex min-h-16 items-center gap-3 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-surface text-success-foreground">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-foreground">Aplicativo instalado</span>
          </div>
        ) : canInstall ? (
          <MenuRow
            icon={Download}
            label="Instalar aplicativo"
            hint="Acesso rápido pela tela inicial"
            onClick={pwaStatus === "ios" ? () => setPwaIosSheetOpen(true) : promptInstall}
          />
        ) : null}
      </nav>

      <ConfirmAction
        trigger={
          <Button variant="destructive-soft" size="xl" className={cn("w-full")}>
            <LogOut /> Sair da conta
          </Button>
        }
        title="Sair da conta?"
        description="Você vai precisar entrar de novo para fazer pedidos."
        confirmLabel="Sair"
        cancelLabel="Ficar"
        destructive
        onConfirm={logout}
      />

      <p className="text-center text-xs text-muted-foreground">
        Xuá Delivery{APP_VERSION ? ` · versão ${APP_VERSION}` : ""}
      </p>

      <PwaIosInstructionsSheet open={pwaIosSheetOpen} onOpenChange={setPwaIosSheetOpen} />
    </div>
  );
}
