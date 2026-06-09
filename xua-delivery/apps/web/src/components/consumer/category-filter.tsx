"use client";

import { cn } from "@/src/lib/utils";

export interface CategoryItem {
  label: string;
  value: string;
}

const ALL_CATEGORY: CategoryItem = { label: "Todos", value: "all" };

interface CategoryFilterProps {
  categories: CategoryItem[];
  selected: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

export function CategoryFilter({
  categories,
  selected,
  onChange,
  loading = false,
}: CategoryFilterProps) {
  const items = [ALL_CATEGORY, ...categories];

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
        {[100, 80, 60, 90, 70].map((w, i) => (
          <div
            key={i}
            className="shrink-0 animate-pulse rounded-full bg-[#e1e3e4]"
            style={{ width: w, height: 36 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
      {items.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            selected === cat.value
              ? "bg-[#00E0FF] text-[#001735]"
              : "bg-[#f3f4f5] text-[#434656] hover:bg-[#e7e8e9]"
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
