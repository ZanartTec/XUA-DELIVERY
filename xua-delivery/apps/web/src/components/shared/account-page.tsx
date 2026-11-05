"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/src/components/ui/collapsible";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { ChangePasswordForm } from "@/src/components/shared/change-password-form";
import { logout } from "@/src/components/shared/logout-button";
import { api } from "@/src/lib/api-client";
import { formatPhone } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  CONSUMER: "Cliente",
  DISTRIBUTOR_ADMIN: "Distribuidora",
  DRIVER: "Motorista",
  OPS: "Operações",
  SUPPORT: "Suporte",
};

interface Me {
  name: string;
  email: string;
  phone?: string | null;
  role: string;
}

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/** "Minha conta" dos papéis operacionais: identificação, troca de senha e sair (na base, com confirmação). */
export function AccountPage() {
  const [pwOpen, setPwOpen] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ consumer: Me }>("/api/auth/me"),
  });
  const user = me.data?.consumer;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Minha conta" />
      <div className="space-y-4 px-4 pb-6">
        {me.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : user ? (
          <section className="flex items-center gap-4 rounded-2xl border border-hairline bg-card p-4">
            <Avatar className="size-14">
              <AvatarFallback className="bg-linear-to-br from-primary to-sky font-heading text-lg font-bold text-primary-foreground">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-bold text-ink">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABEL[user.role] ?? user.role}
                {user.phone ? ` · ${formatPhone(user.phone)}` : ""}
              </p>
            </div>
          </section>
        ) : null}

        <Collapsible open={pwOpen} onOpenChange={setPwOpen} className="rounded-2xl border border-hairline bg-card">
          <CollapsibleTrigger className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
            <span className="flex size-10 items-center justify-center rounded-xl bg-sky/10 text-primary">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <span className="flex-1 text-sm font-semibold text-foreground">Alterar senha</span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", pwOpen && "rotate-180")} aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-hairline px-4 pt-4 pb-4">
            <ChangePasswordForm />
          </CollapsibleContent>
        </Collapsible>

        <ConfirmAction
          trigger={
            <Button variant="destructive-soft" size="xl" className="w-full">
              <LogOut /> Sair da conta
            </Button>
          }
          title="Sair da conta?"
          description="Você vai precisar entrar de novo para continuar."
          confirmLabel="Sair"
          cancelLabel="Ficar"
          destructive
          onConfirm={logout}
        />

        <p className="text-center text-xs text-muted-foreground">Xuá Delivery{APP_VERSION ? ` · versão ${APP_VERSION}` : ""}</p>
      </div>
    </div>
  );
}
