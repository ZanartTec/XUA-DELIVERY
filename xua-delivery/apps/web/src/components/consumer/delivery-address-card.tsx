"use client";

import { Home } from "lucide-react";
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

export function DeliveryAddressCard({
  address,
  loading = false,
  label = "Entregando em",
  actionLabel = "Alterar",
  emptyTitle = "Selecionar endereço",
  emptyDescription = "Toque para adicionar",
  className,
  onClick,
}: DeliveryAddressCardProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737688]">
          {label}
        </p>
        <button
          type="button"
          onClick={onClick}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {actionLabel}
        </button>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#e1e3e4] bg-white p-4 text-left transition-all active:scale-[0.98] hover:border-primary/30"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5697E9]/15">
          <Home className="h-5 w-5 text-primary" />
        </div>
        {loading ? (
          <div className="flex-1 space-y-2 animate-pulse">
            <div className="h-3 w-24 rounded bg-[#e1e3e4]" />
            <div className="h-2.5 w-40 rounded bg-[#e1e3e4]" />
          </div>
        ) : address ? (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#191c1d]">
              {address.label || "Endereço"}
            </p>
            <p className="text-xs text-[#737688] truncate">
              {address.street}, {address.number}
              {address.complement ? ` — ${address.complement}` : ""}
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{emptyTitle}</p>
            <p className="text-xs text-[#737688]">{emptyDescription}</p>
          </div>
        )}
      </button>
    </div>
  );
}