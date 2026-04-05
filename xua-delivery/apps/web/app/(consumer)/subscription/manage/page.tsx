"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Repeat, Plus } from "lucide-react";
import type { Subscription } from "@/src/types";
import { DeliveryWindow, SubscriptionStatus } from "@/src/types/enums";

export default function SubscriptionManagePage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((data) => setSubscriptions(data.subscriptions ?? []))
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

  if (loading) {
    return (
      <div className="space-y-4 pb-4">
        <div className="px-4 pt-4">
          <h1 className="text-lg font-bold font-heading">Minhas assinaturas</h1>
        </div>
        <div className="mx-4 rounded-2xl bg-white/80 p-6 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
          <div className="space-y-3">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4] animate-pulse" />
            <div className="h-4 w-32 rounded-lg bg-[#e1e3e4] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="px-4 pt-4 flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading">Minhas assinaturas</h1>
        <Link href="/subscription/create">
          <Button size="sm" className="rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]">
            <Plus className="mr-1 h-4 w-4" /> Nova
          </Button>
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <div className="mx-4 flex flex-col items-center gap-3 py-10">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0041c8]/10">
            <Repeat className="h-10 w-10 text-[#0041c8]/40" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhuma assinatura ativa.</p>
          <Link href="/subscription/create">
            <Button className="rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] font-semibold shadow-none hover:opacity-90 active:scale-[0.98]">
              Criar assinatura
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3 mx-4">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold font-heading">Assinatura #{sub.id}</p>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    sub.status === SubscriptionStatus.ACTIVE
                      ? "bg-green-100 text-green-700"
                      : sub.status === SubscriptionStatus.PAUSED
                        ? "bg-amber-100 text-amber-700"
                        : "bg-[#e1e3e4] text-muted-foreground"
                  }`}
                >
                  {sub.status === SubscriptionStatus.ACTIVE
                    ? "Ativa"
                    : sub.status === SubscriptionStatus.PAUSED
                      ? "Pausada"
                      : "Cancelada"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {sub.quantity} garrafão(ões) — {sub.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
              </p>
              <div className="mt-3 flex gap-2">
                {sub.status === SubscriptionStatus.ACTIVE && (
                  <Button size="sm" onClick={() => toggleStatus(sub.id, "pause")} className="rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]">
                    Pausar
                  </Button>
                )}
                {sub.status === SubscriptionStatus.PAUSED && (
                  <Button size="sm" onClick={() => toggleStatus(sub.id, "resume")} className="rounded-xl bg-linear-to-r from-[#0041c8] to-[#0055ff] text-white font-semibold shadow-none hover:opacity-90">
                    Retomar
                  </Button>
                )}
                {sub.status !== SubscriptionStatus.CANCELLED && (
                  <Button size="sm" variant="destructive" onClick={() => toggleStatus(sub.id, "cancel")} className="rounded-xl shadow-none">
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
