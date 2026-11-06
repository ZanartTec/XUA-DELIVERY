"use client";

import { useState } from "react";
import { Home, MapPin, MoreVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PageHeader } from "@/src/components/shared/page-header";
import { EmptyState } from "@/src/components/shared/empty-state";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { AddressForm } from "@/src/components/consumer/address-form";
import { formatAddressLine, useAddressMutations, useAddresses } from "@/src/hooks/consumer/use-addresses";
import { ApiError } from "@/src/lib/api-client";
import type { Address } from "@/src/types";

type Editing = { mode: "new" } | { mode: "edit"; address: Address } | null;

export default function AddressesPage() {
  const { data: addresses, isLoading } = useAddresses();
  const { update, remove } = useAddressMutations();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  async function makeDefault(addr: Address) {
    try {
      await update.mutateAsync({ id: addr.id, patch: { is_default: true } });
      toast.success("Endereço principal atualizado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Endereço excluído");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível excluir.");
    }
  }

  const list = addresses ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader back="/profile" title="Meus endereços" />

      <div className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={MapPin} title="Nenhum endereço cadastrado" description="Cadastre onde quer receber a água." />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {list.map((addr) => (
              <li key={addr.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10">
                  <Home className="size-5 text-primary" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="truncate">{addr.label || "Endereço"}</span>
                    {addr.is_default ? <StatusBadge label="Principal" tone="info" className="h-5 px-2 text-[11px]" /> : null}
                  </p>
                  <p className="truncate text-sm text-foreground">{formatAddressLine(addr)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {addr.neighborhood} — {addr.city}/{addr.state} · CEP {addr.zip_code}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-touch" aria-label={`Ações do endereço ${addr.label || formatAddressLine(addr)}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => setEditing({ mode: "edit", address: addr })}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    {!addr.is_default ? (
                      <DropdownMenuItem onSelect={() => makeDefault(addr)}>
                        <Star /> Tornar principal
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(addr)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Para mudar a rua ou o CEP, cadastre um novo endereço e exclua o antigo. Seus pedidos anteriores não são afetados.
        </p>
      </div>

      <StickyActionBar>
        <Button variant="cta" size="xl" onClick={() => setEditing({ mode: "new" })}>
          <Plus /> Adicionar endereço
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.mode === "edit" ? "Editar endereço" : "Novo endereço"}
        description={editing?.mode === "edit" ? undefined : "Informe o CEP para começar."}
      >
        {editing ? (
          <AddressForm
            key={editing.mode === "edit" ? editing.address.id : "new"}
            address={editing.mode === "edit" ? editing.address : undefined}
            onSaved={() => {
              toast.success(editing.mode === "edit" ? "Endereço atualizado" : "Endereço adicionado");
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </ResponsiveDialog>

      <ConfirmAction
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir este endereço?"
        description={deleting ? `${formatAddressLine(deleting)}. Pedidos já feitos para ele continuam no histórico.` : undefined}
        confirmLabel="Excluir"
        cancelLabel="Manter"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
