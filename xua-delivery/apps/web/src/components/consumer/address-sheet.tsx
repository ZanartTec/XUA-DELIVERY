"use client";

import { useState } from "react";
import { Home, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { AddressForm } from "@/src/components/consumer/address-form";
import { formatAddressLine, useSelectedAddress } from "@/src/hooks/consumer/use-addresses";
import { cn } from "@/src/lib/utils";
import type { Address } from "@/src/types";

interface AddressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mantidos por compatibilidade: a seleção vive no checkout store. */
  selectedAddressId?: string | null;
  onSelect?: (address: Address) => void;
}

/** Escolher ou cadastrar o endereço de entrega (bottom sheet no mobile). */
export function AddressSheet({ open, onOpenChange, onSelect }: AddressSheetProps) {
  const { address: selected, addresses, isLoading, select } = useSelectedAddress();
  const [adding, setAdding] = useState(false);

  // Ao fechar, volta para a lista na próxima abertura.
  function handleOpenChange(next: boolean) {
    if (!next) setAdding(false);
    onOpenChange(next);
  }

  // Sem endereço cadastrado, abre direto no formulário.
  const showForm = adding || (!isLoading && addresses.length === 0);

  function choose(addr: Address) {
    select(addr.id);
    onSelect?.(addr);
    handleOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={showForm ? "Novo endereço" : "Endereço de entrega"}
      description={showForm ? "Informe o CEP para começar." : "Escolha onde quer receber seu pedido."}
    >
      {showForm ? (
        <AddressForm
          onSaved={(addr) => {
            toast.success("Endereço adicionado");
            choose(addr);
          }}
          onCancel={addresses.length ? () => setAdding(false) : undefined}
        />
      ) : (
        <div className="grid gap-3 pb-2">
          {isLoading ? (
            <>
              <Skeleton className="h-18 rounded-2xl" />
              <Skeleton className="h-18 rounded-2xl" />
            </>
          ) : (
            <RadioGroup
              value={selected?.id ?? ""}
              onValueChange={(id) => {
                const addr = addresses.find((a) => a.id === id);
                if (addr) choose(addr);
              }}
              aria-label="Endereços salvos"
            >
              {addresses.map((addr) => {
                const checked = addr.id === selected?.id;
                return (
                  <Label
                    key={addr.id}
                    htmlFor={`addr-${addr.id}`}
                    className={cn(
                      "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 transition-colors",
                      checked ? "border-primary ring-1 ring-primary" : "border-hairline hover:border-primary/40",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky/10">
                      <Home className="size-5 text-primary" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {addr.label || "Endereço"}
                        {addr.is_default ? (
                          <span className="text-[11px] font-medium text-primary">Principal</span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {formatAddressLine(addr)}
                      </span>
                    </span>
                    <RadioGroupItem id={`addr-${addr.id}`} value={addr.id} aria-label={`${addr.label || "Endereço"}: ${formatAddressLine(addr)}`} />
                  </Label>
                );
              })}
            </RadioGroup>
          )}

          <Button variant="soft" size="xl" className="w-full border border-dashed border-sky/40" onClick={() => setAdding(true)}>
            <Plus />
            Adicionar endereço
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
