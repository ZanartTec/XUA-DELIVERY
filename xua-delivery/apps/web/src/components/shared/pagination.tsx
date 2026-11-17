"use client";

import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/src/components/ui/pagination";
import { cn } from "@/src/lib/utils";

interface PaginationProps {
  /** Página atual (1-based) */
  page: number;
  /** Total de páginas */
  totalPages: number;
  /** Callback ao mudar de página */
  onPageChange: (page: number) => void;
  className?: string;
}

/** Itens exibidos: primeira, última, a atual e uma vizinha de cada lado; o resto vira reticências. */
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: (number | "…")[] = [1];
  if (current > 3) items.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) items.push(i);

  if (current < total - 2) items.push("…");
  items.push(total);
  return items;
}

/**
 * Paginação por callback (o estado da página vive na tela), montada com o `Pagination` do shadcn.
 *
 * @example
 * <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const go = (target: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    onPageChange(target);
  };
  const atStart = page === 1;
  const atEnd = page === totalPages;

  return (
    <PaginationRoot aria-label="Navegação por páginas" className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text="Anterior"
            aria-label="Página anterior"
            aria-disabled={atStart}
            className={cn(atStart && "pointer-events-none opacity-50")}
            onClick={atStart ? (event) => event.preventDefault() : go(page - 1)}
          />
        </PaginationItem>
        {buildPages(page, totalPages).map((item, index) => (
          <PaginationItem key={item === "…" ? `ellipsis-${index}` : item}>
            {item === "…" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href="#"
                isActive={item === page}
                aria-label={`Ir para página ${item}`}
                onClick={go(item)}
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            text="Próxima"
            aria-label="Próxima página"
            aria-disabled={atEnd}
            className={cn(atEnd && "pointer-events-none opacity-50")}
            onClick={atEnd ? (event) => event.preventDefault() : go(page + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}
