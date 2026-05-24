"use client";

import { useMemo } from "react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/src/components/ui/calendar";
import type { AvailableDeliveryDate } from "@/src/hooks/use-available-delivery-dates";

interface DeliveryDateCalendarProps {
  selectedDates: string[];
  maxDates: number;
  fromDate?: string;
  toDate?: string;
  availableDates?: AvailableDeliveryDate[] | null;
  loading?: boolean;
  error?: string | null;
  onToggleDate: (isoDate: string) => void;
}

function toLocalMidnight(isoDate: string): Date {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasAvailableWindow(date: AvailableDeliveryDate): boolean {
  return date.morning_available || date.afternoon_available;
}

export function DeliveryDateCalendar({
  selectedDates,
  maxDates,
  fromDate,
  toDate,
  availableDates,
  loading = false,
  error = null,
  onToggleDate,
}: DeliveryDateCalendarProps) {
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const selected = useMemo(
    () => selectedDates.map(toLocalMidnight),
    [selectedDates],
  );

  const availabilityByDate = useMemo(() => {
    if (!availableDates) return null;
    return new Map(availableDates.map((date) => [date.date, date]));
  }, [availableDates]);

  const disabled = useMemo(() => {
    const rules: ((date: Date) => boolean)[] = [(date) => date < today];

    if (fromDate) {
      const from = toLocalMidnight(fromDate);
      rules.push((date) => date < from);
    }

    if (toDate) {
      const to = toLocalMidnight(toDate);
      rules.push((date) => date > to);
    }

    if (loading) {
      rules.push(() => true);
    } else if (availabilityByDate) {
      rules.push((date) => {
        const availability = availabilityByDate.get(toIsoString(date));
        return !availability || !hasAvailableWindow(availability);
      });
    }

    return rules;
  }, [availabilityByDate, fromDate, loading, today, toDate]);

  const hasAnyAvailableDate = useMemo(
    () => availableDates?.some(hasAvailableWindow) ?? true,
    [availableDates],
  );

  function handleSelect(dates: Date[] | undefined) {
    const next = dates ?? [];
    const added = next.find((date) => !selectedDates.includes(toIsoString(date)));
    const removed = selected.find(
      (date) => !next.some((nextDate) => toIsoString(nextDate) === toIsoString(date)),
    );

    if (added) {
      if (selectedDates.length >= maxDates) return;
      onToggleDate(toIsoString(added));
      return;
    }

    if (removed) onToggleDate(toIsoString(removed));
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold text-primary">{selectedDates.length}</span>
        {" / "}
        <span className="font-semibold">{maxDates}</span>
        {" datas selecionadas"}
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Carregando datas disponíveis...</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && !error && !hasAnyAvailableDate && (
        <p className="text-xs text-muted-foreground">
          Nenhuma data disponível para este distribuidor no período do plano.
        </p>
      )}

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