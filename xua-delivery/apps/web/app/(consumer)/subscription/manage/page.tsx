"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Repeat,
  Plus,
  Sun,
  Cloud,
  Pause,
  Play,
  XCircle,
  Droplets,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import type { Subscription } from "@/src/types";
import { DeliveryWindow, SubscriptionStatus } from "@/src/types/enums";

const DAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export default function SubscriptionManagePage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((data) => setSubscriptions(Array.isArray(data) ? data : data.subscriptions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleStatus(id: string, action: "pause" | "resume" | "cancel") {
    await fetch(`/api/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status:
                action === "pause"
                  ? SubscriptionStatus.PAUSED
                  : action === "resume"
                    ? SubscriptionStatus.ACTIVE
                    : SubscriptionStatus.CANCELLED,
            }
          : s
      )
    );
  }

  const active = subscriptions.filter((s) => s.status === SubscriptionStatus.ACTIVE);
  const others = subscriptions.filter((s) => s.status !== SubscriptionStatus.ACTIVE);

  if (loading) {
    return (
      <div className="pb-6">
        <section className="px-6 pt-6 pb-2">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688]">
            Recorrência
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#191c1d] font-heading mt-1">
            Assinaturas
          </h1>
        </section>
        <div className="space-y-3 px-6 mt-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-3xl bg-white p-5">
              <div className="h-5 w-40 rounded-lg bg-[#e1e3e4]" />
              <div className="h-4 w-56 rounded-lg bg-[#e1e3e4] mt-3" />
              <div className="h-4 w-32 rounded-lg bg-[#e1e3e4] mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* -- Editorial Header -- */}
      <section className="px-6 pt-6 pb-2 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688]">
            Recorrência
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#191c1d] font-heading mt-1">
            Assinaturas
          </h1>
        </div>
        <Link
          href="/subscription/create"
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-white text-sm font-bold shadow-none hover:opacity-90 active:scale-[0.97] transition-all"
        >
          <Plus className="h-4 w-4" />
          Nova
        </Link>
      </section>

      {/* -- Empty state -- */}
      {subscriptions.length === 0 && (
        <section className="px-6 mt-8">
          <div className="bg-[#f3f4f5] rounded-3xl p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center mb-5">
              <Repeat className="h-10 w-10 text-[#0041c8]" />
            </div>
            <h2 className="text-xl font-bold text-[#191c1d] font-heading mb-1">
              Sem assinaturas
            </h2>
            <p className="text-sm text-[#4a5e87] mb-5 max-w-60">
              Crie sua primeira assinatura e receba água pura toda semana sem
              precisar pedir.
            </p>
            <Link
              href="/subscription/create"
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-white font-bold hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <Plus className="h-4 w-4" />
              Criar assinatura
            </Link>
          </div>
        </section>
      )}

      {/* -- Active subscriptions -- */}
      {active.length > 0 && (
        <section className="px-6 mt-6">
          <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688] mb-3">
            Ativas
          </h2>
          <div className="space-y-3">
            {active.map((sub) => (
              <div
                key={sub.id}
                className="bg-white rounded-3xl p-5 relative overflow-hidden"
              >
                {/* Accent bar */}
                <div className="absolute top-0 left-0 w-1 h-full bg-linear-to-b from-[#0041c8] to-[#0055ff] rounded-l-3xl" />

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Droplets className="h-5 w-5 text-[#0041c8]" />
                    </div>
                    <div>
                      <p className="font-bold text-[#191c1d] font-heading">
                        {(sub.qty_20l ?? sub.quantity)} {(sub.qty_20l ?? sub.quantity) > 1 ? "garrafões" : "garrafão"}
                      </p>
                      <p className="text-xs text-[#737688]">#{shortId(sub.id)}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Ativa
                  </span>
                </div>

                {/* Details row */}
                <div className="flex items-center gap-4 text-sm text-[#4a5e87] mb-4">
                  <span className="flex items-center gap-1.5">
                    {sub.delivery_window === DeliveryWindow.MORNING ? (
                      <Sun className="h-3.5 w-3.5" />
                    ) : (
                      <Cloud className="h-3.5 w-3.5" />
                    )}
                    {sub.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
                  </span>
                  {sub.weekday != null && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {DAY_LABELS[sub.weekday] ?? `Dia ${sub.weekday}`}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleStatus(sub.id, "pause")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-[#f3f4f5] text-[#4a5e87] text-sm font-semibold hover:bg-[#e8e9ea] active:scale-[0.97] transition-all"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pausar
                  </button>
                  <button
                    onClick={() => toggleStatus(sub.id, "cancel")}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-red-500 text-sm font-semibold hover:bg-red-50 active:scale-[0.97] transition-all"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -- Paused / Cancelled -- */}
      {others.length > 0 && (
        <section className="px-6 mt-8">
          <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737688] mb-3">
            Pausadas e canceladas
          </h2>
          <div className="space-y-2">
            {others.map((sub) => {
              const isPaused = sub.status === SubscriptionStatus.PAUSED;
              return (
                <div
                  key={sub.id}
                  className="bg-white rounded-2xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#f3f4f5] flex items-center justify-center">
                      <Droplets className="h-4 w-4 text-[#737688]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-[#191c1d]">
                        {(sub.qty_20l ?? sub.quantity)} {(sub.qty_20l ?? sub.quantity) > 1 ? "garrafões" : "garrafão"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            isPaused ? "text-amber-600" : "text-[#737688]"
                          }`}
                        >
                          {isPaused ? "Pausada" : "Cancelada"}
                        </span>
                        <span className="text-[10px] text-[#c3c5d9]">
                          #{shortId(sub.id)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isPaused && (
                    <button
                      onClick={() => toggleStatus(sub.id, "resume")}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-white text-xs font-bold hover:opacity-90 active:scale-[0.97] transition-all"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Retomar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* -- Upsell CTA -- */}
      {subscriptions.length > 0 && (
        <section className="px-6 mt-8">
          <Link href="/subscription/create">
            <div className="bg-[#f3f4f5] rounded-3xl p-5 flex items-center gap-4 hover:bg-[#edeef0] transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                <Plus className="h-5 w-5 text-[#0041c8]" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#191c1d] font-heading text-sm">
                  Adicionar assinatura
                </p>
                <p className="text-xs text-[#4a5e87] mt-0.5">
                  Configure um novo plano de entrega recorrente
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-[#c3c5d9]" />
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}
