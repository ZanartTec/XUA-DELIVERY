"use client";

import type { ReactNode } from "react";
import { cardVariants } from "@/src/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { ListPanel } from "@/src/components/shared/list-panel";
import { useIsDesktop } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";

export interface Column<T> {
  id: string;
  /** Texto do cabeçalho. Vazio para colunas só de ação (vira `sr-only` com `srLabel`). */
  header: string;
  /** Rótulo lido por leitor de tela quando o cabeçalho é visualmente vazio. */
  srLabel?: string;
  cell: (item: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

interface DataViewProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  /** Nome da lista/tabela para leitor de tela. */
  label: string;
  /** Colunas da tabela (desktop, ≥ 768px). */
  columns: readonly Column<T>[];
  /** Conteúdo de cada linha no celular; vem dentro de um `<li>` do painel. */
  renderMobile: (item: T) => ReactNode;
  /** Classe extra da linha, nas duas visões (ex.: fundo para itens inativos). */
  rowClassName?: (item: T) => string | undefined;
  onOpen?: (item: T) => void;
}

const ALIGN = { left: "text-left", right: "text-right tabular-nums" } as const;

/**
 * Lista que vira tabela densa no desktop e painel de linhas no celular.
 * A tabela mostra todas as colunas; o celular mostra só o que `renderMobile` decidir.
 */
export function DataView<T>({ items, getKey, label, columns, renderMobile, rowClassName, onOpen }: DataViewProps<T>) {
  const desktop = useIsDesktop();

  if (!desktop) {
    return (
      <ListPanel aria-label={label}>
        {items.map((item) => (
          <li key={getKey(item)} className={rowClassName?.(item)}>
            {renderMobile(item)}
          </li>
        ))}
      </ListPanel>
    );
  }

  return (
    <div className={cardVariants({ className: "overflow-hidden" })}>
      <Table aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.id} className={cn(ALIGN[column.align ?? "left"], column.className)}>
                {column.header || <span className="sr-only">{column.srLabel}</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={getKey(item)}
              onClick={onOpen ? () => onOpen(item) : undefined}
              className={cn(onOpen && "cursor-pointer", rowClassName?.(item))}
            >
              {columns.map((column) => (
                <TableCell key={column.id} className={cn(ALIGN[column.align ?? "left"], column.className)}>
                  {column.cell(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
