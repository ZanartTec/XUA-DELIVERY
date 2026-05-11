"use client";

import { useMemo } from "react";
import { Calendar } from "@/src/components/ui/calendar";
import { ptBR } from "date-fns/locale";

interface SubscriptionCalendarProps {
  /** ISO strings of already selected dates */
  selectedDates: string[];
  /** Maximum number of dates the user can select */
  maxDates: number;
  /** ISO string — plan start date (inclusive) */
  fromDate?: string;
  /** ISO string — plan end date (inclusive) */
  toDate?: string;
  onToggleDate: (isoDate: string) => void;
}

function toLocalMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIsoString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SubscriptionCalendar({
  selectedDates,
  maxDates,
  fromDate,
  toDate,
  onToggleDate,
}: SubscriptionCalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const selected = useMemo(
    () => selectedDates.map(toLocalMidnight),
    [selectedDates]
  );

  const disabled = useMemo(() => {
    const rules: ((d: Date) => boolean)[] = [
      (d) => d < today,
    ];
    if (fromDate) {
      const from = toLocalMidnight(fromDate);
      rules.push((d) => d < from);
    }
    if (toDate) {
      const to = toLocalMidnight(toDate);
      rules.push((d) => d > to);
    }
    return rules;
  }, [today, fromDate, toDate]);

  function handleSelect(dates: Date[] | undefined) {
    const next = dates ?? [];
    // Find the date that was toggled
    const added = next.find(
      (d) => !selectedDates.includes(toIsoString(d))
    );
    const removed = selected.find(
      (d) => !next.some((n) => toIsoString(n) === toIsoString(d))
    );
    if (added) {
      // Don't exceed max
      if (selectedDates.length >= maxDates) return;
      onToggleDate(toIsoString(added));
    } else if (removed) {
      onToggleDate(toIsoString(removed));
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold text-primary">{selectedDates.length}</span>
        {" / "}
        <span className="font-semibold">{maxDates}</span>
        {" datas selecionadas"}
      </div>
      <Calendar
        mode="multiple"
        selected={selected}
        onSelect={handleSelect}
        disabled={disabled}
        locale={ptBR}
        className="rounded-2xl border border-[#d9dde3] bg-white shadow-sm"
      />
    </div>
  );
}
