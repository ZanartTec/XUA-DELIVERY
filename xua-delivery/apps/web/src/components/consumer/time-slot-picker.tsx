"use client";

import { useEffect, useState } from "react";
import { useCheckoutStore } from "@/src/store/checkout";
import { api } from "@/src/lib/api-client";

type TimeSlot = {
  id: string;
  label: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  window: string;
  is_active: boolean;
  sort_order: number;
};

interface TimeSlotPickerProps {
  zoneId: string;
  date: string;
  distributorId?: string;
}

function formatHour(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TimeSlotPicker({ zoneId, date, distributorId }: TimeSlotPickerProps) {
  const { selectedSlotId, setSelectedSlotId, setSelectedWindow } = useCheckoutStore();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (distributorId) params.set("distributor_id", distributorId);

    api
      .get<{ slots: TimeSlot[] }>(`/api/zones/${zoneId}/time-slots?${params}`)
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [zoneId, date, distributorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (slots.length === 0) return null;

  const handleSelect = (slot: TimeSlot) => {
    setSelectedSlotId(slot.id);
    // Map the slot's window to the checkout store window
    setSelectedWindow(slot.window.toLowerCase() as "morning" | "afternoon");
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Escolha o horário</p>
      <div className="grid grid-cols-2 gap-2">
        {slots.map((slot) => {
          const isSelected = selectedSlotId === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => handleSelect(slot)}
              className={`rounded-lg border px-3 py-3 text-center text-sm font-medium transition-colors ${
                isSelected
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
              }`}
            >
              <span className="block text-xs text-gray-500">{slot.label}</span>
              <span className="block">
                {formatHour(slot.start_hour, slot.start_minute)} –{" "}
                {formatHour(slot.end_hour, slot.end_minute)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
