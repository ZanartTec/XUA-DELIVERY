"use client";

import { cn } from "@/src/lib/utils";

export interface FilterOption<T extends string = string> {
  label: string;
  value: T;
  /** Número de itens (badge) */
  count?: number;
}

interface FilterChipsProps<T extends string = string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Chips de filtro genérico e reutilizável.
 *
 * @example
 * const FILTERS = [
 *   { label: "Todos", value: "all" },
 *   { label: "Ativos", value: "active", count: 2 },
 * ];
 * <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
 */
export function FilterChips<T extends string = string>({
  options,
  value,
  onChange,
  className,
}: FilterChipsProps<T>) {
  return (
    <div
      className={cn("flex gap-2 overflow-x-auto scrollbar-none pb-0.5", className)}
      role="group"
      aria-label="Filtros"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 select-none",
              active
                ? "bg-[#5697E9] text-white shadow-[0_2px_8px_rgba(86,151,233,0.30)]"
                : "bg-[#f3f4f5] text-[#737688] hover:bg-[#e8eaec]"
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  active ? "bg-white/25 text-white" : "bg-[#e1e3e4] text-[#737688]"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
