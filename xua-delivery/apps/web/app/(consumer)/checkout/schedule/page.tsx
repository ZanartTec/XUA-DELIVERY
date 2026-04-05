"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { CalendarDays, ArrowRight } from "lucide-react";

const WINDOWS = [
  { value: "morning", label: "Manhã (8h–12h)" },
  { value: "afternoon", label: "Tarde (13h–18h)" },
];

function getNext7Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function CheckoutSchedulePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);
  const days = getNext7Days();

  function handleContinue() {
    if (!selectedDate || !selectedWindow) return;
    const params = new URLSearchParams({ date: selectedDate, window: selectedWindow });
    router.push(`/checkout/payment?${params.toString()}`);
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-2 px-4 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-[#0041c8] to-[#0055ff]">
          <CalendarDays className="h-4.5 w-4.5 text-white" />
        </div>
        <h1 className="text-lg font-bold font-heading">Agendar entrega</h1>
      </div>

      {/* Escolha do dia */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Escolha o dia</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => {
            const iso = d.toISOString().split("T")[0];
            const label = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
            return (
              <button
                key={iso}
                onClick={() => setSelectedDate(iso)}
                className={cn(
                  "shrink-0 rounded-xl px-4 py-2.5 text-sm transition-all active:scale-95",
                  selectedDate === iso
                    ? "bg-[#0041c8] text-white font-medium shadow-[0_2px_8px_rgba(0,65,200,0.3)]"
                    : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Escolha da janela */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Escolha a janela</p>
        <div className="flex gap-3">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setSelectedWindow(w.value)}
              className={cn(
                "flex-1 rounded-xl px-4 py-3 text-sm transition-all active:scale-[0.98]",
                selectedWindow === w.value
                  ? "bg-[#0041c8] text-white font-medium shadow-[0_2px_8px_rgba(0,65,200,0.3)]"
                  : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        <Button
          className="w-full gap-1.5 rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] py-3 text-base font-semibold shadow-none hover:opacity-90 active:scale-[0.98]"
          disabled={!selectedDate || !selectedWindow}
          onClick={handleContinue}
        >
          Continuar para pagamento <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
