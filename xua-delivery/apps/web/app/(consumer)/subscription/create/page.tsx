"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { DeliveryWindow } from "@/src/types/enums";
import {
  Droplets,
  Sun,
  Cloud,
  Minus,
  Plus,
  ArrowRight,
  ArrowLeft,
  Check,
  CalendarDays,
  Loader2,
} from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Seg", full: "Segunda" },
  { value: 2, label: "Ter", full: "Terça" },
  { value: 3, label: "Qua", full: "Quarta" },
  { value: 4, label: "Qui", full: "Quinta" },
  { value: 5, label: "Sex", full: "Sexta" },
  { value: 6, label: "Sáb", full: "Sábado" },
];

const WINDOWS = [
  {
    value: DeliveryWindow.MORNING,
    label: "Manhã",
    desc: "08h — 12h",
    icon: Sun,
  },
  {
    value: DeliveryWindow.AFTERNOON,
    label: "Tarde",
    desc: "13h — 17h",
    icon: Cloud,
  },
];

export default function SubscriptionCreatePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [qty, setQty] = useState(1);
  const [window, setWindow] = useState<string>(DeliveryWindow.MORNING);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 3;
  const canAdvance =
    step === 0 ? qty >= 1 : step === 1 ? !!window : selectedDay !== null;

  function next() {
    if (step < totalSteps - 1) {
      setError(null);
      setStep(step + 1);
    }
  }

  function back() {
    if (step > 0) {
      setError(null);
      setStep(step - 1);
    }
  }

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
          window,
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

  const selectedDayLabel = WEEKDAYS.find((d) => d.value === selectedDay)?.full;
  const selectedWindowLabel = WINDOWS.find((w) => w.value === window)?.label;

  return (
    <div className="pb-6 min-h-[calc(100dvh-80px)] flex flex-col">
      {/* -- Header -- */}
      <section className="px-6 pt-6 pb-4">
        <button
          onClick={() => (step > 0 ? back() : router.back())}
          className="flex items-center gap-1 text-sm font-semibold text-[#4a5e87] mb-4 hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688]">
          Nova assinatura
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#191c1d] font-heading mt-1">
          {step === 0
            ? "Quantidade"
            : step === 1
              ? "Entrega"
              : "Dia da semana"}
        </h1>

        {/* Progress dots */}
        <div className="flex items-center gap-2 mt-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step
                  ? "w-8 bg-primary hover:bg-primary-hover"
                  : i < step
                    ? "w-4 bg-primary"
                    : "w-4 bg-[#e1e3e4]"
              )}
            />
          ))}
        </div>
      </section>

      {/* -- Step content -- */}
      <section className="flex-1 px-6">
        {/* STEP 0 — Quantity */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Droplets className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-[#191c1d] font-heading">
                    Garrafão 20L
                  </p>
                  <p className="text-xs text-[#737688]">Água mineral purificada</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-5">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="w-12 h-12 rounded-2xl bg-[#f3f4f5] flex items-center justify-center text-[#4a5e87] hover:bg-[#e8e9ea] active:scale-95 transition-all"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="text-center min-w-16">
                  <span className="text-5xl font-extrabold text-[#191c1d] font-heading">
                    {qty}
                  </span>
                </div>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-12 h-12 rounded-2xl bg-[#f3f4f5] flex items-center justify-center text-[#4a5e87] hover:bg-[#e8e9ea] active:scale-95 transition-all"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-[#737688] text-center mt-4">
                {qty === 1 ? "garrafão por entrega" : "garrafões por entrega"}
              </p>
            </div>

            {/* Quick select */}
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl text-sm font-semibold transition-all",
                    qty === n
                      ? "bg-primary text-white"
                      : "bg-[#f3f4f5] text-[#4a5e87] hover:bg-[#e8e9ea]"
                  )}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1 — Delivery window */}
        {step === 1 && (
          <div className="space-y-3">
            {WINDOWS.map((w) => {
              const Icon = w.icon;
              const sel = window === w.value;
              return (
                <button
                  key={w.value}
                  onClick={() => setWindow(w.value)}
                  className={cn(
                    "w-full rounded-3xl p-5 flex items-center gap-4 transition-all text-left",
                    sel
                      ? "bg-white ring-2 ring-primary"
                      : "bg-[#f3f4f5] hover:bg-[#edeef0]"
                  )}
                >
                  <div
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                      sel ? "bg-primary text-white" : "bg-white text-[#4a5e87]"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[#191c1d] font-heading">
                      {w.label}
                    </p>
                    <p className="text-sm text-[#737688]">{w.desc}</p>
                  </div>
                  {sel && (
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* STEP 2 — Weekday */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {WEEKDAYS.map((d) => {
                const sel = selectedDay === d.value;
                return (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDay(d.value)}
                    className={cn(
                      "rounded-2xl py-4 flex flex-col items-center gap-1 transition-all",
                      sel
                        ? "bg-primary text-white"
                        : "bg-[#f3f4f5] text-[#4a5e87] hover:bg-[#e8e9ea]"
                    )}
                  >
                    <CalendarDays className="h-5 w-5" />
                    <span className="text-sm font-bold">{d.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Review summary */}
            <div className="bg-white rounded-3xl p-5 mt-2">
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688] mb-3">
                Resumo
              </p>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#737688]">Quantidade</span>
                  <span className="font-bold text-[#191c1d]">
                    {qty} {qty > 1 ? "garrafões" : "garrafão"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737688]">Período</span>
                  <span className="font-bold text-[#191c1d]">
                    {selectedWindowLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737688]">Dia</span>
                  <span className="font-bold text-[#191c1d]">
                    {selectedDayLabel ?? "—"}
                  </span>
                </div>
                <div className="h-px bg-[#e1e3e4] my-1" />
                <div className="flex justify-between">
                  <span className="text-[#737688]">Frequência</span>
                  <span className="font-bold text-primary">Semanal</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* -- Error -- */}
      {error && (
        <div className="mx-6 mt-3 rounded-2xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600 font-medium">{error}</p>
        </div>
      )}

      {/* -- Action button -- */}
      <div className="px-6 mt-6">
        {step < totalSteps - 1 ? (
          <button
            disabled={!canAdvance}
            onClick={next}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all",
              canAdvance
                ? "bg-primary hover:bg-primary-hover text-white hover:opacity-90 active:scale-[0.97]"
                : "bg-[#e1e3e4] text-[#737688] cursor-not-allowed"
            )}
          >
            Continuar
            <ArrowRight className="h-4.5 w-4.5" />
          </button>
        ) : (
          <button
            disabled={loading || !canAdvance}
            onClick={handleCreate}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all",
              canAdvance && !loading
                ? "bg-primary hover:bg-primary-hover text-white hover:opacity-90 active:scale-[0.97]"
                : "bg-[#e1e3e4] text-[#737688] cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                Criar assinatura
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
