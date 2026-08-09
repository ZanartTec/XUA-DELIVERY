"use client";

import { ArrowLeftRight, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import {
  useUpdateZone,
  type DistributorOption,
  type OpsZone,
} from "@/src/hooks/ops/use-ops-zones";
import { CoverageEditor } from "./coverage-editor";
import { ZoneDeactivateDialog } from "./zone-deactivate-dialog";
import { ZoneForm } from "./zone-form";
import { ZoneTransferDialog } from "./zone-transfer-dialog";
import { OPS_ROW_ACTION } from "./styles";

export const ZONE_TABLE_COLUMNS = 7;

interface ZoneRowProps {
  zone: OpsZone;
  distributors: DistributorOption[];
  showDistributorColumn: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  transferOpen: boolean;
  onTransferOpenChange: (open: boolean) => void;
  deactivateOpen: boolean;
  onDeactivateOpenChange: (open: boolean) => void;
}

const CELL = "px-3 py-2.5 align-middle";

export function ZoneRow({
  zone,
  distributors,
  showDistributorColumn,
  isExpanded,
  onToggleExpand,
  isEditing,
  onStartEdit,
  onStopEdit,
  transferOpen,
  onTransferOpenChange,
  deactivateOpen,
  onDeactivateOpenChange,
}: ZoneRowProps) {
  const updateZone = useUpdateZone();

  async function handleRename(name: string) {
    try {
      await updateZone.mutateAsync({ zoneId: zone.id, name });
      toast.success("Zona renomeada");
      onStopEdit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao renomear zona");
    }
  }

  async function handleToggleActive(nextActive: boolean) {
    try {
      const result = await updateZone.mutateAsync({ zoneId: zone.id, is_active: nextActive });
      onDeactivateOpenChange(false);
      if (nextActive) {
        toast.success("Zona reativada");
      } else if (result.affected_addresses > 0) {
        toast.success(
          `Zona desativada · ${result.affected_addresses} endereço(s) sem cobertura`
        );
      } else {
        toast.success("Zona desativada");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao alterar status da zona");
    }
  }

  return (
    <>
      <tr
        className={cn(
          "border-b border-[#e4e8f1] transition-colors hover:bg-[#e1e3e4]/30",
          !zone.is_active && "opacity-60",
          isExpanded && "bg-[#00E0FF]/5"
        )}
      >
        <td className={cn(CELL, "w-8")}>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Recolher cobertura" : "Expandir cobertura"}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-[#e1e3e4]"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>

        <td className={cn(CELL, "font-medium")}>
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-left hover:underline"
          >
            {zone.name}
          </button>
        </td>

        {showDistributorColumn && (
          <td className={cn(CELL, "text-muted-foreground")}>{zone.distributor.name}</td>
        )}

        <td className={cn(CELL, "tabular-nums text-muted-foreground")}>
          {zone._count.coverage}
        </td>
        <td className={cn(CELL, "tabular-nums text-muted-foreground")}>
          {zone._count.addresses}
        </td>
        <td className={cn(CELL, "tabular-nums text-muted-foreground")}>
          {zone._count.orders}
        </td>

        <td className={CELL}>
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              zone.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
            )}
          >
            {zone.is_active ? "Ativa" : "Inativa"}
          </span>
        </td>

        <td className={cn(CELL, "text-right")}>
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              className={OPS_ROW_ACTION}
              onClick={onStartEdit}
              aria-label={`Renomear ${zone.name}`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              className={OPS_ROW_ACTION}
              onClick={() => onTransferOpenChange(true)}
              aria-label={`Transferir ${zone.name}`}
            >
              <ArrowLeftRight className="h-3 w-3" />
            </Button>
            {zone.is_active ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-xl text-xs text-red-600 hover:bg-red-50"
                onClick={() => onDeactivateOpenChange(true)}
              >
                Desativar
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={updateZone.isPending}
                className="h-7 rounded-xl bg-[#00E0FF] text-xs font-semibold text-[#001735] shadow-none hover:bg-[#00E0FF]/90"
                onClick={() => handleToggleActive(true)}
              >
                Reativar
              </Button>
            )}
          </div>
        </td>
      </tr>

      {isEditing && (
        <tr className="border-b border-[#e4e8f1] bg-white">
          <td colSpan={showDistributorColumn ? ZONE_TABLE_COLUMNS + 1 : ZONE_TABLE_COLUMNS} className="px-3 py-3">
            <div className="max-w-sm">
              <ZoneForm
                title="Renomear zona"
                initialName={zone.name}
                submitLabel="Salvar"
                isSaving={updateZone.isPending}
                onSubmit={handleRename}
                onCancel={onStopEdit}
              />
            </div>
          </td>
        </tr>
      )}

      {isExpanded && (
        <tr className="border-b border-[#e4e8f1] bg-[#00E0FF]/5">
          <td colSpan={showDistributorColumn ? ZONE_TABLE_COLUMNS + 1 : ZONE_TABLE_COLUMNS} className="px-3 py-3">
            <CoverageEditor zone={zone} />
          </td>
        </tr>
      )}

      <ZoneTransferDialog
        zone={zone}
        distributors={distributors}
        open={transferOpen}
        onOpenChange={onTransferOpenChange}
      />
      <ZoneDeactivateDialog
        zone={zone}
        open={deactivateOpen}
        isPending={updateZone.isPending}
        onOpenChange={onDeactivateOpenChange}
        onConfirm={() => handleToggleActive(false)}
      />
    </>
  );
}
