"use client";

import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import { useSelectedAddress } from "@/src/hooks/consumer/use-addresses";

/** "Entregar em …" do consumidor: abre o seletor de endereço. Vive no header do celular e do desktop. */
export function ConsumerAddress() {
  const { address, isLoading } = useSelectedAddress();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-muted"
        aria-label={
          address
            ? `Endereço de entrega: ${address.street}, ${address.number}. Trocar`
            : "Selecionar endereço de entrega"
        }
      >
        <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Entregar em
          </span>
          <span className="flex items-center gap-0.5 text-sm font-medium text-foreground">
            <span className="truncate">
              {address
                ? `${address.label ? `${address.label} · ` : ""}${address.street}, ${address.number}`
                : isLoading
                  ? "Carregando…"
                  : "Adicionar endereço"}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </span>
        </span>
      </button>
      <AddressSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
