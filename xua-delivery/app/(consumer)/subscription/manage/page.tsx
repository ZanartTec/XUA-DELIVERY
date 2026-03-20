"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { Subscription } from "@/src/types";

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
    await fetch(`/api/subscriptions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status:
                action === "pause"
                  ? "paused"
                  : action === "resume"
                    ? "active"
                    : "cancelled",
            }
          : s
      )
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">Minhas assinaturas</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Minhas assinaturas</h1>
        <Link href="/subscription/create">
          <Button size="sm">Nova</Button>
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <p className="text-gray-500">Nenhuma assinatura ativa.</p>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Assinatura #{sub.id}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      sub.status === "active"
                        ? "bg-green-100 text-green-700"
                        : sub.status === "paused"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {sub.status === "active"
                      ? "Ativa"
                      : sub.status === "paused"
                        ? "Pausada"
                        : "Cancelada"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-gray-600">
                  {sub.quantity} garrafão(ões) — {sub.delivery_window === "morning" ? "Manhã" : "Tarde"}
                </p>
                <div className="flex gap-2">
                  {sub.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(sub.id, "pause")}>
                      Pausar
                    </Button>
                  )}
                  {sub.status === "paused" && (
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(sub.id, "resume")}>
                      Retomar
                    </Button>
                  )}
                  {sub.status !== "cancelled" && (
                    <Button size="sm" variant="destructive" onClick={() => toggleStatus(sub.id, "cancel")}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
