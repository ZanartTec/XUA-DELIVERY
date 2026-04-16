"use client";

interface PeriodSelectorProps {
  value: string;
  onChange: (period: string) => void;
}

const PERIODS = [
  { label: "Hoje", value: "1d" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "90 dias", value: "90d" },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg border p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            value === p.value
              ? "bg-[#C8F708] text-[#1a2600] font-semibold"
              : "hover:bg-muted"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
