"use client";

import { useState } from "react";
import {
  ALL_DISTRIBUTORS,
  DistributorPicker,
} from "@/src/components/ops/zones/distributor-picker";
import { ZoneTable } from "@/src/components/ops/zones/zone-table";
import { OPS_CARD, OPS_TITLE } from "@/src/components/ops/zones/styles";
import { useOpsDistributors } from "@/src/hooks/ops/use-ops-zones";
import { cn } from "@/src/lib/utils";

/**
 * Painel de zonas de atendimento (ops).
 *
 * Master-detail: escolhe-se a distribuidora (ou "todas") e a tabela lista as
 * zonas com filtros e paginação resolvidos no servidor. No desktop as duas
 * colunas convivem; no mobile viram dois passos, porque o shell de ops é
 * bottom-nav mobile-first.
 */
export default function ZonesPage() {
  const { distributors, isLoading, isError } = useOpsDistributors();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pré-seleciona a primeira distribuidora ativa para a tela não abrir vazia no
  // desktop, sem precisar de efeito: enquanto o usuário não escolheu nada
  // (selectedId null), cai no fallback calculado direto na renderização.
  const firstActiveId = distributors.find((d) => d.is_active)?.id ?? distributors[0]?.id ?? null;
  const effectiveSelectedId = selectedId ?? firstActiveId;

  const isAll = effectiveSelectedId === ALL_DISTRIBUTORS;
  const selected = isAll ? null : (distributors.find((d) => d.id === effectiveSelectedId) ?? null);
  const hasSelection = isAll || selected !== null;

  if (isError) {
    return (
      <div className="space-y-3">
        <h1 className={OPS_TITLE}>Zonas de Atendimento</h1>
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
          Erro ao carregar as distribuidoras.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className={OPS_TITLE}>Zonas de Atendimento</h1>
        <p className="text-xs text-muted-foreground">
          Cada zona pertence a uma distribuidora e define, por bairro e CEP, onde ela
          entrega.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(220px,280px)_1fr]">
        <div className={cn(hasSelection && "hidden md:block")}>
          <DistributorPicker
            distributors={distributors}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedId}
            isLoading={isLoading}
          />
        </div>

        <div className={cn(!hasSelection && "hidden md:block")}>
          {hasSelection ? (
            <ZoneTable
              key={effectiveSelectedId}
              distributor={selected}
              distributors={distributors}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div
              className={cn(
                OPS_CARD,
                "flex h-full min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground"
              )}
            >
              {isLoading
                ? "Carregando distribuidoras..."
                : "Selecione uma distribuidora para ver suas zonas."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
