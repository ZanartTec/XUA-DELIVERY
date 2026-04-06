"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { useCartStore } from "@/src/store/cart";
import { useAuthStore } from "@/src/store/auth";
import { formatCurrency } from "@/src/lib/utils";
import { cn } from "@/src/lib/utils";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import { useIsClient } from "@/src/hooks/use-is-client";
import type { Address } from "@/src/types";
import {
  ArrowLeft,
  ChevronRight,
  Home,
  Sun,
  CloudSun,
  Moon,
  Droplets,
  Zap,
} from "lucide-react";

type TimeWindow = "morning" | "afternoon" | "evening";

const WINDOWS: { value: TimeWindow; label: string; sublabel: string; icon: typeof Sun }[] = [
  { value: "morning", label: "Manhã", sublabel: "Entre 08:00 - 12:00", icon: Sun },
  { value: "afternoon", label: "Tarde", sublabel: "Entre 12:00 - 17:00", icon: CloudSun },
  { value: "evening", label: "Noite", sublabel: "Entre 17:00 - 21:00", icon: Moon },
];

const MONTH_SHORT: Record<number, string> = {
  0: "jan", 1: "fev", 2: "mar", 3: "abr", 4: "mai", 5: "jun",
  6: "jul", 7: "ago", 8: "set", 9: "out", 10: "nov", 11: "dez",
};

const WEEKDAY: Record<number, string> = {
  0: "Domingo", 1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira",
  4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado",
};

function getNext5Days(): { date: Date; iso: string; isToday: boolean }[] {
  const result: { date: Date; iso: string; isToday: boolean }[] = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push({
      date: d,
      iso: d.toISOString().split("T")[0],
      isToday: i === 0,
    });
  }
  return result;
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
  if (w === "evening") return "Noite";
  return "";
}

export default function CheckoutSchedulePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [days] = useState(() => getNext5Days());
  const [selectedDate, setSelectedDate] = useState<string>(() => days[0].iso);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [instructions, setInstructions] = useState("");
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  // Address state
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);

  const loadDefaultAddress = useCallback(async () => {
    if (!user?.id) return;
    setAddressLoading(true);
    try {
      const res = await fetch(`/api/consumers/${user.id}/addresses`);
      const data = await res.json();
      const list: Address[] = data.addresses ?? [];
      if (list.length > 0) {
        const def = list.find((a) => a.is_default) ?? list[0];
        setSelectedAddress(def);
      }
    } catch {
      // silently fail
    } finally {
      setAddressLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadDefaultAddress();
  }, [loadDefaultAddress]);

  const isClient = useIsClient();
  const getSubtotalCents = useCartStore((s) => s.getSubtotalCents);
  const items = useCartStore((s) => s.items);
  const deliveryFeeCents = 500;
  const totalCents = isClient ? getSubtotalCents() + deliveryFeeCents : 0;
  const itemCount = isClient ? items.reduce((acc, i) => acc + i.quantity, 0) : 0;

  const selectedDayObj = days.find((d) => d.iso === selectedDate);
  const selectedLabel = selectedDayObj
    ? `${selectedDayObj.date.getDate()} de ${MONTH_SHORT[selectedDayObj.date.getMonth()]}`
    : "";

  function handleContinue() {
    if (!selectedDate || !selectedWindow) return;
    const params = new URLSearchParams({
      date: selectedDate,
      window: selectedWindow,
      ...(selectedAddress ? { addressId: selectedAddress.id } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    });
    router.push(`/checkout/payment?${params.toString()}`);
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
      <div className="mx-4 rounded-2xl bg-linear-to-br from-[#0041c8] to-[#0055ff] p-5 relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 opacity-15">
          <Droplets className="h-32 w-32 text-white" />
        </div>
        <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Etapa 02/03
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
            className="text-xs font-semibold text-[#0041c8] hover:underline"
          >
            Alterar
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAddressSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#e1e3e4] bg-white p-4 text-left transition-all active:scale-[0.98] hover:border-[#0041c8]/30"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8eeff]">
            <Home className="h-5 w-5 text-[#0041c8]" />
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
              <p className="text-sm font-semibold text-[#0041c8]">Selecionar endereço</p>
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
          {days.map((d) => {
            const info = formatDayLabel(d.date, d.isToday);
            const selected = selectedDate === d.iso;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setSelectedDate(d.iso)}
                className={cn(
                  "flex flex-col items-center shrink-0 rounded-2xl px-4 py-3 min-w-20 transition-all active:scale-95",
                  selected
                    ? "bg-[#0041c8] text-white shadow-[0_4px_12px_rgba(0,65,200,0.3)]"
                    : "bg-white border border-[#e1e3e4] text-[#191c1d] hover:border-[#0041c8]/30",
                )}
              >
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-wider",
                    selected ? "text-white/80" : "text-[#737688]",
                  )}
                >
                  {info.top}
                </span>
                <span className="text-xl font-bold mt-0.5">{info.day}</span>
                <span
                  className={cn(
                    "text-[10px] capitalize",
                    selected ? "text-white/70" : "text-[#737688]",
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
        <div className="space-y-2">
          {WINDOWS.map((w) => {
            const selected = selectedWindow === w.value;
            const Icon = w.icon;
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => setSelectedWindow(w.value)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl p-4 transition-all active:scale-[0.98]",
                  selected
                    ? "bg-white border-2 border-[#0041c8] shadow-[0_2px_12px_rgba(0,65,200,0.1)]"
                    : "bg-white border border-[#e1e3e4] hover:border-[#0041c8]/30",
                )}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                    selected ? "bg-[#0041c8]/10" : "bg-[#f0f2f4]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      selected ? "text-[#0041c8]" : "text-[#737688]",
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
                      ? "border-[#0041c8] bg-[#0041c8]"
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
          className="w-full rounded-2xl border border-[#e1e3e4] bg-[#f8f9fa] px-4 py-3 text-sm text-[#191c1d] placeholder:text-[#737688]/50 resize-none focus:outline-none focus:border-[#0041c8]/40 transition-colors"
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8eeff] border-2 border-white">
              <Droplets className="h-3.5 w-3.5 text-[#0041c8]" />
            </div>
            {itemCount > 1 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f0f2f4] border-2 border-white text-[10px] font-bold text-[#737688]">
                +{itemCount - 1}
              </div>
            )}
          </div>
        </div>
        <Button
          className="w-full h-12 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-white font-semibold text-sm shadow-none hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          disabled={!selectedDate || !selectedWindow || !selectedAddress}
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
        onSelect={setSelectedAddress}
      />
    </div>
  );
}
