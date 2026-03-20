"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Card, CardContent } from "@/src/components/ui/card";

interface Delivery {
  order_id: string;
  consumer_name: string;
  address_line: string;
  status: string;
  delivery_window: string;
  sequence: number;
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/driver/deliveries")
      .then((r) => r.json())
      .then((data) => setDeliveries(data.deliveries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Entregas do dia</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Entregas do dia</h1>

      {deliveries.length === 0 ? (
        <p className="text-gray-500">Nenhuma entrega pendente.</p>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => (
            <Link key={d.order_id} href={`/driver/deliveries/${d.order_id}/otp`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      <span className="text-gray-400 mr-1">#{d.sequence}</span>
                      {d.consumer_name}
                    </p>
                    <p className="text-xs text-gray-500">{d.address_line}</p>
                    <StatusPill status={d.status} />
                  </div>
                  <span className="text-xs text-gray-400">
                    {d.delivery_window === "morning" ? "Manhã" : "Tarde"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
