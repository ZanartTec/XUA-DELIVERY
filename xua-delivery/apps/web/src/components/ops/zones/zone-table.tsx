"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ArrowLeft, MapPinOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Pagination } from "@/src/components/shared/pagination";
import { cn } from "@/src/lib/utils";
import {
  useCreateZone,
  useOpsZones,
  ZONES_PAGE_SIZE,
  type DistributorOption,
  type ZoneStatusFilter,
} from "@/src/hooks/ops/use-ops-zones";
import { ZoneFiltersBar } from "./zone-filters";
import { ZoneForm } from "./zone-form";
import { ZoneRow } from "./zone-row";
import { OPS_CARD, OPS_CTA } from "./styles";

interface ZoneTableProps {
  /** null = todas as distribuidoras. */
  distributor: DistributorOption | null;
  distributors: DistributorOption[];
  /** Só no mobile, onde o seletor e a tabela são dois passos. */
  onBack?: () => void;
}

const HEAD_CLASS =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export function ZoneTable({ distributor, distributors, onBack }: ZoneTableProps) {
  const [q, setQ] = useState("");
  const [coverage, setCoverage] = useState("");
  const [status, setStatus] = useState<ZoneStatusFilter>("active");
  const [offset, setOffset] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const deferredQ = useDeferredValue(q);
  const deferredCoverage = useDeferredValue(coverage);

  // Mudar filtro tem que voltar para a primeira página, senão a tela abre vazia
  // num offset que não existe mais no novo resultado.
  useEffect(() => {
    setOffset(0);
  }, [deferredQ, deferredCoverage, status, distributor?.id]);

  const { zones, pagination, isLoading, isFetching, isError } = useOpsZones({
    distributor_id: distributor?.id ?? null,
    q: deferredQ.trim(),
    coverage: deferredCoverage.trim(),
    status,
    offset,
    limit: ZONES_PAGE_SIZE,
  });

  const createZone = useCreateZone();
  const showDistributorColumn = !distributor;
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 0;
  const currentPage = pagination ? Math.floor(pagination.offset / pagination.limit) + 1 : 1;

  async function handleCreate(name: string) {
    if (!distributor) return;
    try {
      await createZone.mutateAsync({ name, distributor_id: distributor.id });
      toast.success("Zona criada");
      setIsCreating(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar zona");
    }
  }

  function clearFilters() {
    setQ("");
    setCoverage("");
    setStatus("active");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onBack}
              aria-label="Voltar para distribuidoras"
              className="rounded-xl md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold font-heading">
              {distributor?.name ?? "Todas as distribuidoras"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {pagination
                ? `${pagination.total} ${pagination.total === 1 ? "zona" : "zonas"}`
                : "—"}
              {isFetching && !isLoading && " · atualizando..."}
            </p>
          </div>
        </div>

        {distributor && !isCreating && (
          <Button size="sm" className={OPS_CTA} onClick={() => setIsCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nova zona
          </Button>
        )}
      </div>

      <ZoneFiltersBar
        q={q}
        coverage={coverage}
        status={status}
        onQChange={setQ}
        onCoverageChange={setCoverage}
        onStatusChange={setStatus}
        onClear={clearFilters}
      />

      {isCreating && distributor && (
        <div className={cn(OPS_CARD, "p-4")}>
          <ZoneForm
            title={`Nova zona em ${distributor.name}`}
            submitLabel="Criar zona"
            isSaving={createZone.isPending}
            onSubmit={handleCreate}
            onCancel={() => setIsCreating(false)}
          />
        </div>
      )}

      {isError ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
          Erro ao carregar as zonas.
        </div>
      ) : isLoading ? (
        <div className={cn(OPS_CARD, "space-y-2 p-4")}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-[#e1e3e4]" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        <div className={cn(OPS_CARD, "flex flex-col items-center gap-2 p-6 text-center")}>
          <MapPinOff className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhuma zona encontrada com os filtros atuais.
          </p>
        </div>
      ) : (
        <div className={cn(OPS_CARD, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e4e8f1]">
                  <th className={cn(HEAD_CLASS, "w-8")}>
                    <span className="sr-only">Expandir</span>
                  </th>
                  <th className={HEAD_CLASS}>Zona</th>
                  {showDistributorColumn && <th className={HEAD_CLASS}>Distribuidora</th>}
                  <th className={HEAD_CLASS}>Cobertura</th>
                  <th className={HEAD_CLASS}>Endereços</th>
                  <th className={HEAD_CLASS}>Pedidos</th>
                  <th className={HEAD_CLASS}>Status</th>
                  <th className={cn(HEAD_CLASS, "text-right")}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <ZoneRow
                    key={zone.id}
                    zone={zone}
                    distributors={distributors}
                    showDistributorColumn={showDistributorColumn}
                    isExpanded={expandedId === zone.id}
                    onToggleExpand={() =>
                      setExpandedId((current) => (current === zone.id ? null : zone.id))
                    }
                    isEditing={editingId === zone.id}
                    onStartEdit={() => setEditingId(zone.id)}
                    onStopEdit={() => setEditingId(null)}
                    transferOpen={transferId === zone.id}
                    onTransferOpenChange={(open) => setTransferId(open ? zone.id : null)}
                    deactivateOpen={deactivateId === zone.id}
                    onDeactivateOpenChange={(open) => setDeactivateId(open ? zone.id : null)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > pagination.limit && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e8f1] px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {pagination.offset + 1}–
                {Math.min(pagination.offset + pagination.limit, pagination.total)} de{" "}
                {pagination.total}
              </span>
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => setOffset((page - 1) * ZONES_PAGE_SIZE)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
