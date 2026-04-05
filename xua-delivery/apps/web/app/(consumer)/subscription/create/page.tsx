"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";
import { DeliveryWindow } from "@/src/types/enums";
import { Repeat, ArrowRight } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const WINDOWS = [
  { value: DeliveryWindow.MORNING, label: "Manhã" },
  { value: DeliveryWindow.AFTERNOON, label: "Tarde" },
];

export default function SubscriptionCreatePage() {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [window, setWindow] = useState<string>(DeliveryWindow.MORNING);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (selectedDay === null) {
      setError("Selecione um dia da semana.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qty_20l: qty,
          window: window,
          weekday: selectedDay,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Erro ao criar assinatura");
        return;
      }
      router.push("/subscription/manage");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="px-4 pt-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-[#0041c8] to-[#0055ff]">
          <Repeat className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-lg font-bold font-heading">Nova assinatura</h1>
      </div>

      {/* Quantidade */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Quantidade por entrega</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setQty(Math.max(1, qty - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e1e3e4] text-lg font-semibold hover:bg-[#d1d3d4] active:scale-95">
            −
          </button>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 rounded-xl border-0 bg-[#e1e3e4] text-center font-semibold"
          />
          <button onClick={() => setQty(qty + 1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e1e3e4] text-lg font-semibold hover:bg-[#d1d3d4] active:scale-95">
            +
          </button>
        </div>
      </div>

      {/* Janela de entrega */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Janela de entrega</p>
        <div className="flex gap-3">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className={cn(
                "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                window === w.value
                  ? "bg-[#0041c8] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]"
                  : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dias da semana */}
      <div className="mx-4 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
        <p className="mb-3 text-sm font-semibold font-heading">Dia da semana</p>
        <div className="flex gap-2 flex-wrap">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              onClick={() => setSelectedDay(d.value)}
              className={cn(
                "rounded-full w-12 h-12 text-sm font-medium transition-all",
                selectedDay === d.value
                  ? "bg-[#0041c8] text-white shadow-[0_2px_8px_rgba(0,65,200,0.3)]"
                  : "bg-[#e1e3e4] text-muted-foreground hover:bg-[#d1d3d4]"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mx-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="mx-4">
        <Button className="w-full rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]" disabled={loading} onClick={handleCreate}>
          {loading ? "Criando..." : "Criar assinatura"}
          {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
