"use client";

import { Home, MapPin } from "lucide-react";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/lib/utils";
import type { Address } from "@/src/types";

interface DeliveryAddressCardProps {
  address: Address | null;
  loading?: boolean;
  label?: string;
  actionLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  onClick: () => void;
}

/** Endereço de entrega com ação "Trocar" (o card inteiro é o alvo de toque). */
export function DeliveryAddressCard({
  address,
  loading = false,
  label = "Entregar em",
  actionLabel = "Trocar",
  emptyTitle = "Adicionar endereço",
  emptyDescription = "Toque para cadastrar onde vai receber",
  className,
  onClick,
}: DeliveryAddressCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={address ? `${label}: ${address.street}, ${address.number}. ${actionLabel}` : emptyTitle}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:border-primary/40",
        className,
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky/10">
        {address ? <Home className="size-5 text-primary" aria-hidden /> : <MapPin className="size-5 text-primary" aria-hidden />}
      </span>
      {loading ? (
        <span className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-40" />
        </span>
      ) : address ? (
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-sm font-semibold text-foreground">
            {address.label ? `${address.label} · ` : ""}
            {address.street}, {address.number}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {address.complement ? `${address.complement} · ` : ""}
            {address.neighborhood}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-primary">{emptyTitle}</span>
          <span className="block text-xs text-muted-foreground">{emptyDescription}</span>
        </span>
      )}
      <span className="shrink-0 text-sm font-semibold text-primary">{address ? actionLabel : null}</span>
    </button>
  );
}
