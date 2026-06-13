"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";
import { DeliveryDateCalendar } from "@/src/components/consumer/delivery-date-calendar";
import { TimeSlotPicker } from "@/src/components/consumer/time-slot-picker";
import { useAvailableDeliveryDates } from "@/src/hooks/use-available-delivery-dates";

interface EditDeliveryDateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string;
  distributorId: string;
  /** Data atual da entrega (ISO) — exibida como referência. */
  currentDate: string;
  /** Limite superior = validade do plano (YYYY-MM-DD). */
  maxDate?: string | null;
  submitting: boolean;
  onConfirm: (input: { date: string; time_slot_id: string }) => void | Promise<void>;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

function daysUntil(maxDate?: string | null): number {
  if (!maxDate) return 60;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${maxDate.slice(0, 10)}T00:00:00`);
  const diff = Math.ceil((end.getTime() - today.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.min(180, diff));
}

function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function EditDeliveryDateSheet({
  open,
  onOpenChange,
  zoneId,
  distributorId,
  currentDate,
  maxDate,
  submitting,
  onConfirm,
}: EditDeliveryDateSheetProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const fromDate = useMemo(() => tomorrowIso(), []);
  const days = useMemo(() => daysUntil(maxDate), [maxDate]);

  // A seleção nasce limpa a cada abertura: o componente é montado condicionalmente
  // pelo pai (`{editTarget && <EditDeliveryDateSheet/>}`), então não precisa de reset.

  const { availableDates, loading, error } = useAvailableDeliveryDates({
    zoneId,
    distributorId,
    days,
    enabled: open,
  });

  function handleToggleDate(iso: string) {
    setSelectedDate((prev) => (prev === iso ? null : iso));
    setSelectedSlotId(null);
  }

  const canConfirm = !!selectedDate && !!selectedSlotId && !submitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-2xl px-5 pt-0"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mt-3 mb-5 h-1.5 w-10 rounded-full bg-muted-foreground/25" />

        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="text-lg">Alterar data da entrega</SheetTitle>
          <SheetDescription>
            Entrega atual em <strong>{formatIsoDate(currentDate)}</strong>. Escolha uma nova data e horário.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <DeliveryDateCalendar
            selectedDates={selectedDate ? [selectedDate] : []}
            maxDates={1}
            fromDate={fromDate}
            toDate={maxDate ?? undefined}
            availableDates={availableDates}
            loading={loading}
            error={error}
            onToggleDate={handleToggleDate}
          />

          {selectedDate && (
            <TimeSlotPicker
              zoneId={zoneId}
              date={selectedDate}
              distributorId={distributorId}
              selectedSlotId={selectedSlotId}
              label="Horário desta entrega"
              emptyMessage="Nenhum horário disponível para esta data."
              onSelectSlot={(slotId) => setSelectedSlotId(slotId)}
            />
          )}

          <Button
            className="w-full h-11 text-base font-semibold"
            disabled={!canConfirm}
            onClick={() => {
              if (selectedDate && selectedSlotId) {
                void onConfirm({ date: selectedDate, time_slot_id: selectedSlotId });
              }
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Confirmar nova data"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
