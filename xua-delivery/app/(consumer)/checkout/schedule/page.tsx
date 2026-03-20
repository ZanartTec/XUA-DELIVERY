"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";
import { DeliveryWindow } from "@/src/types/enums";

const WINDOWS = [
  { value: DeliveryWindow.MORNING, label: "Manhã (8h–12h)" },
  { value: DeliveryWindow.AFTERNOON, label: "Tarde (13h–18h)" },
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
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Agendar entrega</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Escolha o dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map((d) => {
              const iso = d.toISOString().split("T")[0];
              const label = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  className={cn(
                    "flex-shrink-0 rounded-lg border px-4 py-2 text-sm",
                    selectedDate === iso
                      ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Escolha a janela</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setSelectedWindow(w.value)}
              className={cn(
                "flex-1 rounded-lg border px-4 py-3 text-sm",
                selectedWindow === w.value
                  ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              {w.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Button
        className="w-full"
        disabled={!selectedDate || !selectedWindow}
        onClick={handleContinue}
      >
        Continuar para pagamento
      </Button>
    </div>
  );
}
