"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";
import { DeliveryWindow } from "@/src/types/enums";

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
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleCreate() {
    if (selectedDays.length === 0) {
      setError("Selecione pelo menos um dia da semana.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qty_per_delivery: qty,
          delivery_window: window,
          weekdays: selectedDays,
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
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Nova assinatura</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quantidade por entrega</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setQty(Math.max(1, qty - 1))}>
            −
          </Button>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 text-center"
          />
          <Button variant="outline" size="sm" onClick={() => setQty(qty + 1)}>
            +
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Janela de entrega</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className={cn(
                "flex-1 rounded-lg border px-4 py-2 text-sm",
                window === w.value
                  ? "border-accent bg-accent/10 text-accent font-medium"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {w.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dias da semana</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              onClick={() => toggleDay(d.value)}
              className={cn(
                "rounded-full w-12 h-12 text-sm border",
                selectedDays.includes(d.value)
                  ? "bg-accent text-white border-accent"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {d.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <Button className="w-full" disabled={loading} onClick={handleCreate}>
        {loading ? "Criando..." : "Criar assinatura"}
      </Button>
    </div>
  );
}
