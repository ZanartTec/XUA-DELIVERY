"use client";

import { Skeleton } from "@/src/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";

export interface CategoryItem {
  label: string;
  value: string;
}

export const ALL_CATEGORY: CategoryItem = { label: "Todos", value: "all" };

interface CategoryFilterProps {
  categories: CategoryItem[];
  selected: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

/** Chips de categoria roláveis (zona de topo, junto da busca). */
export function CategoryFilter({ categories, selected, onChange, loading = false }: CategoryFilterProps) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-hidden">
        {[72, 96, 64, 88].map((w) => (
          <Skeleton key={w} className="h-9 shrink-0 rounded-md" style={{ width: w }} />
        ))}
      </div>
    );
  }

  return (
    <ToggleGroup
      type="single"
      value={selected}
      onValueChange={(v) => onChange(v || ALL_CATEGORY.value)}
      aria-label="Categorias"
      spacing={2}
      className="-mx-4 w-[calc(100%+2rem)] justify-start overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
    >
      {[ALL_CATEGORY, ...categories].map((cat) => (
        <ToggleGroupItem
          key={cat.value}
          value={cat.value}
          className="h-9 shrink-0 rounded-md bg-muted px-4 text-sm font-medium text-muted-foreground data-[state=on]:bg-cta data-[state=on]:text-cta-foreground"
        >
          {cat.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
