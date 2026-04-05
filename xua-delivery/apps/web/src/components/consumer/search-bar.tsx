"use client";

import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="px-4">
      <div className="flex items-center gap-3 rounded-2xl bg-[#f3f4f5] px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-[#737688]" />
        <input
          type="text"
          placeholder="O que você precisa hoje?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-[#191c1d] placeholder:text-[#737688] outline-none"
        />
      </div>
    </div>
  );
}
