"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { SlaCountdown } from "@/src/components/shared/sla-countdown";
import { Card, CardContent } from "@/src/components/ui/card";
import { formatCurrency } from "@/src/lib/utils";
import type { Order } from "@/src/types";

interface QueueOrder extends Order {
  consumer_name: string;
  sla_deadline: string;
}

export default function DistributorQueuePage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders?scope=distributor&status=SENT_TO_DISTRIBUTOR")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Fila de Pedidos</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Fila de Pedidos</h1>
      {orders.length === 0 ? (
        <p className="text-gray-500">Nenhum pedido na fila.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/distributor/orders/${order.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Pedido #{order.id}</p>
                    <p className="text-xs text-gray-500">{order.consumer_name}</p>
                    <StatusPill status={order.status} />
                  </div>
                  <div className="text-right space-y-1">
                    <p className="font-semibold text-sm">{formatCurrency(order.total_cents)}</p>
                    <SlaCountdown deadlineIso={order.sla_deadline} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
