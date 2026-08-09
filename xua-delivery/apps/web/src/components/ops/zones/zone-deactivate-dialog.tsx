"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import type { OpsZone } from "@/src/hooks/ops/use-ops-zones";

interface ZoneDeactivateDialogProps {
  zone: OpsZone;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * Desativar uma zona é silenciosamente destrutivo: novos endereços na área
 * passam a ser recusados com NO_COVERAGE e pedidos na zona são rejeitados no
 * checkout. Daí a confirmação com o impacto explícito.
 */
export function ZoneDeactivateDialog({
  zone,
  open,
  isPending,
  onOpenChange,
  onConfirm,
}: ZoneDeactivateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Desativar “{zone.name}”?</DialogTitle>
          <DialogDescription>
            A zona continua no histórico — nada é apagado. Você pode reativá-la
            depois marcando “ver inativas”.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            <p>Enquanto estiver inativa:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>novos endereços nesta área serão recusados por falta de cobertura;</li>
              <li>novos pedidos na zona serão bloqueados no checkout.</li>
            </ul>
            {zone._count.addresses > 0 && (
              <p className="font-semibold">
                {zone._count.addresses} endereço(s) de cliente já cadastrados serão
                afetados.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
            className="rounded-xl"
          >
            {isPending ? "Desativando..." : "Desativar zona"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
