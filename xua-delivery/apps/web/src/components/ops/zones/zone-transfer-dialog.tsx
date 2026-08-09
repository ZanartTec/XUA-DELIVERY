"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { cn } from "@/src/lib/utils";
import {
  useTransferZone,
  type DistributorOption,
  type OpsZone,
} from "@/src/hooks/ops/use-ops-zones";
import { OPS_CTA, OPS_FIELD_LABEL } from "./styles";

interface ZoneTransferDialogProps {
  zone: OpsZone;
  distributors: DistributorOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Transferir a zona muda o roteamento automático de TODOS os endereços já
 * vinculados a ela — por isso o impacto é mostrado antes de confirmar, e o
 * backend recusa se houver pedido em andamento.
 */
export function ZoneTransferDialog({
  zone,
  distributors,
  open,
  onOpenChange,
}: ZoneTransferDialogProps) {
  const [targetId, setTargetId] = useState("");
  const transferZone = useTransferZone();

  const options = distributors.filter((d) => d.id !== zone.distributor_id && d.is_active);

  async function handleConfirm() {
    if (!targetId) {
      toast.error("Selecione a distribuidora de destino");
      return;
    }
    try {
      await transferZone.mutateAsync({ zoneId: zone.id, distributorId: targetId });
      toast.success("Zona transferida");
      setTargetId("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao transferir zona");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Transferir “{zone.name}”</DialogTitle>
          <DialogDescription>
            A zona sai de {zone.distributor.name} levando toda a sua cobertura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="transfer-target" className={OPS_FIELD_LABEL}>
              Nova distribuidora *
            </label>
            <select
              id="transfer-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {options.map((distributor) => (
                <option key={distributor.id} value={distributor.id}>
                  {distributor.name}
                </option>
              ))}
            </select>
            {options.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Não há outra distribuidora ativa disponível.
              </p>
            )}
          </div>

          {zone._count.addresses > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                {zone._count.addresses} endereço(s) de cliente estão nesta zona. Os
                próximos pedidos deles passarão a ser roteados para a nova
                distribuidora.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={transferZone.isPending || options.length === 0}
            onClick={handleConfirm}
            className={cn(OPS_CTA)}
          >
            {transferZone.isPending ? "Transferindo..." : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
