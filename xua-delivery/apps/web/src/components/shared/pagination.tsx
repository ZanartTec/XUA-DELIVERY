"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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

/** Gera a lista de "itens" que aparecem na paginação: números ou "..." */
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: (number | "…")[] = [];

  // Sempre mostra a primeira e última página
  // Mostra current -1, current, current +1
  const showLeft = current > 3;
  const showRight = current < total - 2;

  items.push(1);

  if (showLeft) items.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) items.push(i);

  if (showRight) items.push("…");

  items.push(total);

  return items;
}

/**
 * Componente de paginação genérico e reutilizável.
 *
 * @example
 * <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = buildPages(page, totalPages);

  return (
    <nav
      aria-label="Navegação por páginas"
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      {/* Botão Anterior */}
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150",
          page === 1
            ? "cursor-not-allowed text-[#b0b3c6]"
            : "text-[#5697E9] hover:bg-[#5697E9]/10 active:scale-90"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Números de página */}
      {items.map((item, idx) =>
        item === "…" ? (
          <span
            key={`ellipsis-${idx}`}
            className="flex h-9 w-9 items-center justify-center text-sm text-[#b0b3c6] select-none"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            aria-label={`Ir para página ${item}`}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-150 active:scale-90",
              item === page
                ? "bg-[#5697E9] text-white shadow-[0_2px_8px_rgba(86,151,233,0.35)]"
                : "text-[#737688] hover:bg-[#f3f4f5]"
            )}
          >
            {item}
          </button>
        )
      )}

      {/* Botão Próximo */}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Próxima página"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150",
          page === totalPages
            ? "cursor-not-allowed text-[#b0b3c6]"
            : "text-[#5697E9] hover:bg-[#5697E9]/10 active:scale-90"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
