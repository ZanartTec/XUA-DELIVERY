"use client";

import { useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";
import { api } from "@/src/lib/api-client";

export type DeliveryTimeSlot = {
  id: string;
  label: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  window: string;
  is_active?: boolean;
  sort_order?: number;
};

interface TimeSlotOptionsProps {
  slots: DeliveryTimeSlot[];
  selectedSlotId?: string | null;
  label?: string;
  emptyMessage?: string;
  className?: string;
  columns?: 1 | 2;
  onSelectSlot: (slotId: string, slot: DeliveryTimeSlot) => void;
}

interface TimeSlotPickerProps extends Omit<TimeSlotOptionsProps, "slots"> {
  zoneId: string;
  date: string;
  distributorId?: string;
}

function formatHour(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTimeSlot(slot: DeliveryTimeSlot): string {
  if (slot.label) return slot.label;
  return `${formatHour(slot.start_hour, slot.start_minute)} - ${formatHour(slot.end_hour, slot.end_minute)}`;
}

export function TimeSlotOptions({
  slots,
  selectedSlotId,
  label = "Escolha o horário",
  emptyMessage = "Nenhum horário disponível para esta data.",
  className,
  columns = 2,
  onSelectSlot,
}: TimeSlotOptionsProps) {
  if (slots.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className={cn("grid gap-2", columns === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {slots.map((slot) => {
          const isSelected = selectedSlotId === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelectSlot(slot.id, slot)}
              className={cn(
                "rounded-lg border px-3 py-3 text-center text-sm font-medium transition-colors",
                isSelected
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-blue-300",
              )}
            >
              <span className="block text-xs text-gray-500">{formatTimeSlot(slot)}</span>
              <span className="block">
                {formatHour(slot.start_hour, slot.start_minute)} -{" "}
                {formatHour(slot.end_hour, slot.end_minute)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimeSlotPicker({
  zoneId,
  date,
  distributorId,
  selectedSlotId,
  onSelectSlot,
  label,
  emptyMessage,
  className,
  columns,
}: TimeSlotPickerProps) {
  const [slots, setSlots] = useState<DeliveryTimeSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (distributorId) params.set("distributor_id", distributorId);

    api
      .get<{ slots: DeliveryTimeSlot[] }>(`/api/zones/${zoneId}/time-slots?${params}`)
      .then((data) => {
        if (!cancelled) setSlots(data.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [zoneId, date, distributorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <TimeSlotOptions
      slots={slots}
      selectedSlotId={selectedSlotId}
      onSelectSlot={onSelectSlot}
      label={label}
      emptyMessage={emptyMessage}
      className={className}
      columns={columns}
    />
  );
}
