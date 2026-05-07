"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { useCartStore } from "@/src/store/cart";
import { useAuthStore } from "@/src/store/auth";
import { useCheckoutStore } from "@/src/store/checkout";
import { formatCurrency } from "@/src/lib/utils";
import { cn } from "@/src/lib/utils";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import { useIsClient } from "@/src/hooks/use-is-client";
import { TimeSlotPicker } from "@/src/components/consumer/time-slot-picker";
import type { Address } from "@/src/types";
import {
  ArrowLeft,
  ChevronRight,
  Home,
  Sun,
  CloudSun,
  Droplets,
  Zap,
} from "lucide-react";

type TimeWindow = "morning" | "afternoon";

type AvailableDate = {
  date: string;
  weekday: number;
  morning_available: boolean;
  afternoon_available: boolean;
  has_time_slots: boolean;
};

type DayItem = {
  date: Date;
  iso: string;
  isToday: boolean;
  morningAvailable: boolean;
  afternoonAvailable: boolean;
  anyAvailable: boolean;
};

const WINDOWS: { value: TimeWindow; label: string; sublabel: string; icon: typeof Sun }[] = [
  { value: "morning", label: "Manhã", sublabel: "Entre 08:00 - 12:00", icon: Sun },
  { value: "afternoon", label: "Tarde", sublabel: "Entre 12:00 - 17:00", icon: CloudSun },
];

const MONTH_SHORT: Record<number, string> = {
  0: "jan", 1: "fev", 2: "mar", 3: "abr", 4: "mai", 5: "jun",
  6: "jul", 7: "ago", 8: "set", 9: "out", 10: "nov", 11: "dez",
};

const WEEKDAY: Record<number, string> = {
  0: "Domingo", 1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira",
  4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado",
};

const DAYS_AHEAD = 14;

function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayLabel(d: Date, isToday: boolean): { top: string; day: string; month: string } {
  if (isToday) {
    return {
      top: "HOJE",
      day: String(d.getDate()),
      month: MONTH_SHORT[d.getMonth()],
    };
  }
  return {
    top: WEEKDAY[d.getDay()],
    day: String(d.getDate()),
    month: MONTH_SHORT[d.getMonth()],
  };
}

function getWindowLabel(w: TimeWindow | null): string {
  if (w === "morning") return "Manhã";
  if (w === "afternoon") return "Tarde";
  return "";
}

export default function CheckoutSchedulePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Persisted checkout state (Zustand)
  const selectedDate = useCheckoutStore((s) => s.selectedDate);
  const selectedWindow = useCheckoutStore((s) => s.selectedWindow);
  const instructions = useCheckoutStore((s) => s.instructions);
  const storedAddressId = useCheckoutStore((s) => s.selectedAddressId);
  const selectedDistributorId = useCheckoutStore((s) => s.selectedDistributorId);
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);
  const setSelectedDate = useCheckoutStore((s) => s.setSelectedDate);
  const setSelectedWindow = useCheckoutStore((s) => s.setSelectedWindow);
  const setSelectedSlotId = useCheckoutStore((s) => s.setSelectedSlotId);
  const setInstructions = useCheckoutStore((s) => s.setInstructions);
  const setSelectedAddressId = useCheckoutStore((s) => s.setSelectedAddressId);
  const setSelectedDistributorId = useCheckoutStore((s) => s.setSelectedDistributorId);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  // Se não tem endereço, redireciona para distribuidora (primeiro passo)
  useEffect(() => {
    if (!storedAddressId) {
      router.replace("/checkout/distributor");
    }
  }, [storedAddressId, router]);

  // Address state (full object loaded from API, id persisted in store)
  const [selectedAddress, setSelectedAddressLocal] = useState<Address | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);

  // Available dates from API
  const [availableDates, setAvailableDates] = useState<AvailableDate[] | null>(null);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);

  // When user selects an address, persist its ID and redirect to distributor
  const handleAddressSelect = useCallback((addr: Address) => {
    setSelectedAddressLocal(addr);
    setSelectedAddressId(addr.id);
    // Endereço mudou → precisa reescolher distribuidora
    setSelectedDistributorId(null);
    router.push("/checkout/distributor");
  }, [setSelectedAddressId, setSelectedDistributorId, router]);

  const loadDefaultAddress = useCallback(async () => {
    if (!user?.id) return;
    setAddressLoading(true);
    try {
      const res = await fetch(`/api/consumers/${user.id}/addresses`);
      const data = await res.json();
      const list: Address[] = data.addresses ?? [];
      if (list.length > 0) {
        const fromStore = storedAddressId
          ? list.find((a) => a.id === storedAddressId)
          : null;
        const def = fromStore ?? list.find((a) => a.is_default) ?? list[0];
        setSelectedAddressLocal(def);
        setSelectedAddressId(def.id);
      }
    } catch {
      // silently fail
    } finally {
      setAddressLoading(false);
    }
  }, [user?.id, storedAddressId, setSelectedAddressId]);

  useEffect(() => {
    void loadDefaultAddress();
  }, [loadDefaultAddress]);

  // Fetch available dates whenever address (and thus zone) changes
  const zoneId = selectedAddress?.zone_id ?? null;
  useEffect(() => {
    if (!zoneId) {
      setAvailableDates(null);
      return;
    }
    let cancelled = false;
    setDatesLoading(true);
    setDatesError(null);
    fetch(`/api/zones/${zoneId}/available-dates?days=${DAYS_AHEAD}${selectedDistributorId ? `&distributor_id=${selectedDistributorId}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setAvailableDates((data.dates ?? []) as AvailableDate[]);
      })
      .catch((err) => {
        if (!cancelled) setDatesError(err instanceof Error ? err.message : "Erro ao carregar datas");
      })
      .finally(() => {
        if (!cancelled) setDatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, selectedDistributorId]);

  // Detect if current distributor has time slots configured
  const hasTimeSlots = useMemo(() => {
    if (!availableDates || availableDates.length === 0) return false;
    return availableDates[0].has_time_slots === true;
  }, [availableDates]);

  // Build day cards from API data (fallback to empty list while loading)
  const days: DayItem[] = useMemo(() => {
    if (!availableDates) return [];
    const todayIso = new Date().toISOString().split("T")[0];
    return availableDates.map((d) => ({
      date: parseISODateLocal(d.date),
      iso: d.date,
      isToday: d.date === todayIso,
      morningAvailable: d.morning_available,
      afternoonAvailable: d.afternoon_available,
      anyAvailable: d.morning_available || d.afternoon_available,
    }));
  }, [availableDates]);

  // Auto-select first available date if current selection is invalid
  useEffect(() => {
    if (days.length === 0) return;
    const current = days.find((d) => d.iso === selectedDate);
    if (!current || !current.anyAvailable) {
      const firstAvailable = days.find((d) => d.anyAvailable);
      if (firstAvailable) setSelectedDate(firstAvailable.iso);
    }
  }, [days, selectedDate, setSelectedDate]);

  // Clear window selection if it becomes unavailable for current day
  useEffect(() => {
    if (!selectedDate || !selectedWindow) return;
    if (hasTimeSlots) return; // managed by TimeSlotPicker
    const day = days.find((d) => d.iso === selectedDate);
    if (!day) return;
    if (selectedWindow === "morning" && !day.morningAvailable) setSelectedWindow(null);
    if (selectedWindow === "afternoon" && !day.afternoonAvailable) setSelectedWindow(null);
  }, [days, selectedDate, selectedWindow, setSelectedWindow, hasTimeSlots]);

  // Clear slot when date changes
  useEffect(() => {
    if (hasTimeSlots) {
      setSelectedSlotId(null);
      setSelectedWindow(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const isClient = useIsClient();
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const items = useCartStore((s) => s.items);
  const deliveryFeeCents = 500;
  const totalCents = isClient ? getSubtotalCents() + deliveryFeeCents : 0;
  const itemCount = isClient ? items.reduce((acc, i) => acc + i.quantity, 0) : 0;

  const effectiveDate = selectedDate;
  const selectedDayObj = days.find((d) => d.iso === effectiveDate);
  const selectedLabel = selectedDayObj
    ? `${selectedDayObj.date.getDate()} de ${MONTH_SHORT[selectedDayObj.date.getMonth()]}`
    : "";

  const showSkeleton = datesLoading && days.length === 0;

  function handleContinue() {
    if (!effectiveDate || !selectedWindow) return;
    if (hasTimeSlots && !selectedSlotId) return;
    router.push("/checkout/payment");
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f0f2f4] transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-[#191c1d]" />
        </button>
        <span className="text-lg font-bold font-heading text-[#191c1d]">Xuá</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#191c1d]">
          <Zap className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Hero Banner */}
      <div className="mx-4 rounded-2xl bg-linear-to-br from-primary to-primary-hover p-5 relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 opacity-15">
          <Droplets className="h-32 w-32 text-white" />
        </div>
        <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Etapa 03/04
        </p>
        <h1 className="text-2xl font-bold text-white font-heading mt-1 leading-tight">
          Agendar
          <br />
          Entrega
        </h1>
        <p className="text-sm text-white/70 mt-2">
          Garantindo que sua hidratação chegue sempre no horário.
        </p>
      </div>

      {/* Delivering To */}
      <div className="mx-4 mt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737688]">
            Entregando em
          </p>
          <button
            type="button"
            onClick={() => setAddressSheetOpen(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Alterar
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAddressSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#e1e3e4] bg-white p-4 text-left transition-all active:scale-[0.98] hover:border-primary/30"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5697E9]/15">
            <Home className="h-5 w-5 text-primary" />
          </div>
          {addressLoading ? (
            <div className="flex-1 space-y-2 animate-pulse">
              <div className="h-3 w-24 rounded bg-[#e1e3e4]" />
              <div className="h-2.5 w-40 rounded bg-[#e1e3e4]" />
            </div>
          ) : selectedAddress ? (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#191c1d]">
                {selectedAddress.label || "Endereço"}
              </p>
              <p className="text-xs text-[#737688] truncate">
                {selectedAddress.street}, {selectedAddress.number}
                {selectedAddress.complement ? ` — ${selectedAddress.complement}` : ""}
              </p>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">Selecionar endereço</p>
              <p className="text-xs text-[#737688]">Toque para adicionar</p>
            </div>
          )}
        </button>
      </div>

      {/* Select Delivery Day */}
      <div className="mx-4 mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737688] mb-3">
          Selecione o Dia de Entrega
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {showSkeleton &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="flex flex-col items-center shrink-0 rounded-2xl px-4 py-3 min-w-20 bg-[#f0f2f4] animate-pulse"
              >
                <div className="h-2 w-10 rounded bg-[#e1e3e4]" />
                <div className="mt-1 h-5 w-6 rounded bg-[#e1e3e4]" />
                <div className="mt-1 h-2 w-8 rounded bg-[#e1e3e4]" />
              </div>
            ))}
          {!showSkeleton && datesError && (
            <p className="text-xs text-red-500 py-3">
              Não foi possível carregar as datas. Tente novamente.
            </p>
          )}
          {!showSkeleton &&
            days.map((d) => {
              const info = formatDayLabel(d.date, d.isToday);
              const selected = effectiveDate === d.iso;
              const disabled = !d.anyAvailable;
              return (
                <button
                  key={d.iso}
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Sem entregas neste dia" : undefined}
                  onClick={() => !disabled && setSelectedDate(d.iso)}
                  className={cn(
                    "flex flex-col items-center shrink-0 rounded-2xl px-4 py-3 min-w-20 transition-all",
                    disabled
                      ? "bg-[#f0f2f4] text-[#c4c6cf] opacity-50 cursor-not-allowed"
                      : "active:scale-95",
                    !disabled && selected
                      ? "bg-[#C8F708] text-[#1a2600] shadow-[0_4px_12px_rgba(200,247,8,0.3)]"
                      : !disabled
                        ? "bg-white border border-[#e1e3e4] text-[#191c1d] hover:border-primary/30"
                        : "",
                  )}
                >
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider",
                      selected && !disabled ? "text-[#1a2600]/70" : "text-[#737688]",
                    )}
                  >
                    {info.top}
                  </span>
                  <span className="text-xl font-bold mt-0.5">{info.day}</span>
                  <span
                    className={cn(
                      "text-[10px] capitalize",
                      selected && !disabled ? "text-[#1a2600]/60" : "text-[#737688]",
                    )}
                  >
                    {info.month}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Preferred Time Window */}
      <div className="mx-4 mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737688] mb-3">
          Janela de Horário Preferida
        </p>

        {hasTimeSlots && zoneId && effectiveDate ? (
          <TimeSlotPicker
            zoneId={zoneId}
            date={effectiveDate}
            distributorId={selectedDistributorId ?? undefined}
          />
        ) : (
        <div className="space-y-2">
          {WINDOWS.map((w) => {
            const selected = selectedWindow === w.value;
            const Icon = w.icon;
            const windowAvailable = selectedDayObj
              ? (w.value === "morning"
                  ? selectedDayObj.morningAvailable
                  : selectedDayObj.afternoonAvailable)
              : true;
            const disabled = !windowAvailable || !selectedDayObj;
            return (
              <button
                key={w.value}
                type="button"
                disabled={disabled}
                title={disabled && selectedDayObj ? "Janela indisponível" : undefined}
                onClick={() => !disabled && setSelectedWindow(w.value)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl p-4 transition-all",
                  disabled
                    ? "opacity-50 cursor-not-allowed bg-[#f0f2f4]"
                    : "active:scale-[0.98]",
                  !disabled && selected
                    ? "bg-white border-2 border-primary shadow-[0_2px_12px_rgba(27,74,154,0.1)]"
                    : !disabled
                      ? "bg-white border border-[#e1e3e4] hover:border-primary/30"
                      : "",
                )}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                    selected ? "bg-[#C8F708]/15" : "bg-[#f0f2f4]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      selected ? "text-[#1a2600]" : "text-[#737688]",
                    )}
                  />
                </div>
                <div className="flex-1 text-left">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      selected ? "text-[#191c1d]" : "text-[#191c1d]",
                    )}
                  >
                    {w.label}
                  </p>
                  <p className="text-xs text-[#737688]">{w.sublabel}</p>
                </div>
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-[#C8F708] bg-[#C8F708]"
                      : "border-[#c4c6cf] bg-transparent",
                  )}
                >
                  {selected && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Special Instructions */}
      <div className="mx-4 mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737688] mb-2">
          Instruções Especiais (Opcional)
        </p>
        <textarea
          ref={instructionsRef}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Ex: Deixar na portaria, código 1234..."
          rows={3}
          className="w-full rounded-2xl border border-[#e1e3e4] bg-[#f8f9fa] px-4 py-3 text-sm text-[#191c1d] placeholder:text-[#737688]/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sticky Footer */}
      <div className="sticky bottom-0 mx-4 mt-5 mb-4 rounded-2xl bg-white p-4 shadow-[0_-4px_20px_rgba(0,26,64,0.08)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-[#737688]">
              Selecionado: {selectedLabel}
              {selectedWindow ? `, ${getWindowLabel(selectedWindow)}` : ""}
            </p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold text-[#191c1d] font-heading">
                {isClient ? formatCurrency(totalCents) : "—"}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#737688]">
                Total
              </span>
            </div>
          </div>
          <div className="flex items-center -space-x-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5697E9]/15 border-2 border-white">
              <Droplets className="h-3.5 w-3.5 text-[#5697E9]" />
            </div>
            {itemCount > 1 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f0f2f4] border-2 border-white text-[10px] font-bold text-[#737688]">
                +{itemCount - 1}
              </div>
            )}
          </div>
        </div>
        <Button
          className="w-full h-12 rounded-xl bg-[#C8F708] hover:bg-[#C8F708]/90 text-[#1a2600] font-semibold text-sm shadow-none hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          disabled={!effectiveDate || !selectedWindow || !selectedAddress || (hasTimeSlots && !selectedSlotId)}
          onClick={handleContinue}
        >
          Continuar para Pagamento
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Address Selection Sheet */}
      <AddressSheet
        open={addressSheetOpen}
        onOpenChange={setAddressSheetOpen}
        selectedAddressId={selectedAddress?.id ?? null}
        onSelect={handleAddressSelect}
      />
    </div>
  );
}
