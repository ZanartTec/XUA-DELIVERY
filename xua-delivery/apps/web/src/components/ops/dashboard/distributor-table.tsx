"use client";

import type { DistributorKpiRow } from "@xua/shared/types";

import { formatDecimal, formatInt, formatPercent } from "@/src/components/charts";
import { cn } from "@/src/lib/utils";
import { KpiStatusPill } from "./kpi-status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";

const HEAD_CLASS =
  "py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Tabela cross-distribuidora (fluxo-usuarios.md §ops/kpis).
 * Clicar numa linha alterna o drill-down — o mesmo estado do select do cabeçalho.
 */
export function DistributorTable({
  rows,
  selectedDistributor,
  onSelect,
}: {
  rows: DistributorKpiRow[];
  selectedDistributor: string;
  onSelect: (distributorId: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-card/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
      <p className="mb-3 font-heading text-sm font-semibold text-foreground">
        Resumo por distribuidora
      </p>

      <div className="overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow className="border-b border-border text-left">
              <TableHead className={HEAD_CLASS}>Distribuidora</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-center")}>SLA aceite</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-center")}>Taxa aceite</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-center")}>Reentrega</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-center")}>NPS</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-center")}>Pedidos</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-center")}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelected = selectedDistributor === row.distributor_id;

              return (
                <TableRow
                  key={row.distributor_id}
                  onClick={() => onSelect(isSelected ? "" : row.distributor_id)}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <TableCell className="py-2 font-medium">{row.distributor_name}</TableCell>
                  <TableCell className="py-2 text-center">{formatPercent(row.sla_acceptance_pct)}</TableCell>
                  <TableCell className="py-2 text-center">{formatPercent(row.acceptance_rate_pct)}</TableCell>
                  <TableCell className="py-2 text-center">{formatPercent(row.redelivery_rate_pct)}</TableCell>
                  <TableCell className="py-2 text-center text-muted-foreground">
                    {row.avg_nps === null ? "—" : formatDecimal(row.avg_nps)}
                  </TableCell>
                  <TableCell className="py-2 text-center text-muted-foreground">
                    {formatInt(row.orders_received)}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {row.orders_received === 0 ? (
                      <span className="text-xs text-muted-foreground">Sem volume</span>
                    ) : (
                      <KpiStatusPill status={row.status} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
