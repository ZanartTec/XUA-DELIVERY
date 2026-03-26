"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { Card, CardContent } from "@/src/components/ui/card";
import { formatCurrency } from "@/src/lib/utils";
import { ClipboardList, ChevronRight } from "lucide-react";
import type { Order } from "@/src/types";

interface QueueOrder extends Order {
  consumer_name: string;
  sla_deadline: string;
}

function QueueSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="py-3 space-y-2">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </CardContent>
    </Card>
  );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Fila de Pedidos</h1>
        <span className="text-xs bg-accent/10 text-accent font-medium px-2 py-1 rounded-full">
          {orders.length} pendentes
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <QueueSkeleton key={i} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Nenhum pedido na fila.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Link key={order.id} href={`/distributor/orders/${order.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Pedido #{order.id}</p>
                    <p className="text-xs text-muted-foreground">{order.consumer_name}</p>
                    <StatusPill status={order.status} />
                  </div>
                  <div className="text-right space-y-1 flex items-center gap-2">
                    <div>
                      <p className="font-bold text-sm text-accent">{formatCurrency(order.total_cents)}</p>
                      <SlaCountdown deadlineIso={order.sla_deadline} />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
