"use client";

import { cn } from "@/src/lib/utils";

const CATEGORIES = [
  { label: "Todos", value: "all" },
  { label: "Água Mineral", value: "mineral" },
  { label: "Galões", value: "gallons" },
  { label: "Acessórios", value: "accessories" },
  { label: "Premium", value: "premium" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

interface CategoryFilterProps {
  selected: CategoryValue;
  onChange: (value: CategoryValue) => void;
}

export function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            selected === cat.value
              ? "bg-[#C8F708] text-[#1a2600]"
              : "bg-[#f3f4f5] text-[#434656] hover:bg-[#e7e8e9]"
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
