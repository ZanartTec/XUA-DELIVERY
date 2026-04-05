"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { DeliveryWindow } from "@/src/types/enums";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import { ClipboardList, ChevronRight } from "lucide-react";
import type { Order } from "@/src/types";

function OrderSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="space-y-2 px-4 py-3">
        <div className="h-4 w-32 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-48 rounded-lg bg-[#e1e3e4]" />
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 pb-4">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-bold font-heading text-foreground">Meus pedidos</h1>
      </div>

      {loading ? (
        <div className="space-y-2 px-4">
          {Array.from({ length: 3 }).map((_, i) => <OrderSkeleton key={i} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#0041c8]/10">
            <ClipboardList className="h-10 w-10 text-[#0041c8]/40" />
          </div>
          <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2 px-4">
          {orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div className="flex items-center justify-between rounded-2xl bg-white/95 px-4 py-3 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm transition-shadow hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)]">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Pedido #{order.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(order.delivery_date)} — {order.delivery_window === DeliveryWindow.MORNING ? "Manhã" : "Tarde"}
                  </p>
                  <StatusPill status={order.status} />
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#0041c8]">
                    {formatCurrency(order.total_cents)}
                  </p>
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
