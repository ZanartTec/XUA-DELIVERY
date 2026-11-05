"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        inputMode="search"
        placeholder="Buscar água, galão, vasilhame…"
        aria-label="Buscar produtos"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border-0 bg-muted pr-10 pl-11 text-base md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-2 -translate-y-1/2"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
