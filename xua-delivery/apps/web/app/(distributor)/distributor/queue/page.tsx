"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { formatCurrency } from "@/src/lib/utils";
import { ClipboardList, ChevronRight } from "lucide-react";
import type { Order } from "@/src/types";

interface QueueOrder extends Order {
  consumer_name: string;
  sla_deadline: string;
}

function QueueSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-24 rounded-lg bg-[#e1e3e4]" />
      </div>
    </div>
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
        <h1 className="text-lg font-bold font-heading text-foreground">Fila de Pedidos</h1>
        <span className="text-xs bg-[#0041c8]/10 text-[#0041c8] font-medium px-2.5 py-1 rounded-full">
          {orders.length} pendentes
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <QueueSkeleton key={i} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0041c8]/10 mb-4">
            <ClipboardList className="h-10 w-10 text-[#0041c8]/40" />
          </div>
          <p className="text-muted-foreground">Nenhum pedido na fila.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Link key={order.id} href={`/distributor/orders/${order.id}`}>
              <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)] transition-shadow flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm">Pedido #{order.id}</p>
                  <p className="text-xs text-muted-foreground">{order.consumer_name}</p>
                  <StatusPill status={order.status} />
                </div>
                <div className="text-right space-y-1 flex items-center gap-2">
                  <div>
                    <p className="font-bold text-sm text-[#0041c8]">{formatCurrency(order.total_cents)}</p>
                    <SlaCountdown deadlineIso={order.sla_deadline} />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
