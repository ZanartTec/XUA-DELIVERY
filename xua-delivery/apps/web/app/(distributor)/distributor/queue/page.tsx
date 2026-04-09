"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { SlaCountdown } from "@/src/components/shared/distributor/sla-countdown";
import { formatCurrency } from "@/src/lib/utils";
import { ClipboardList, ChevronRight } from "lucide-react";
import { useSocket } from "@/src/hooks/use-socket";
import type { Order } from "@/src/types";

interface QueueOrder extends Order {
  consumer_name: string;
  address_summary: string;
  total_items_qty: number;
  sla_deadline: string;
}

function formatWindowLabel(window: QueueOrder["delivery_window"]) {
  return window === "MORNING" ? "Manhã" : "Tarde";
}

const SECTION_CONFIG = [
  {
    key: "SENT_TO_DISTRIBUTOR",
    label: "Aguardando aceite",
    statuses: ["SENT_TO_DISTRIBUTOR"] as const,
  },
  {
    key: "IN_PREPARATION",
    label: "Em preparação",
    statuses: ["ACCEPTED_BY_DISTRIBUTOR", "READY_FOR_DISPATCH"] as const,
  },
  {
    key: "OUT_FOR_DELIVERY",
    label: "Em rota",
    statuses: ["OUT_FOR_DELIVERY"] as const,
  },
] as const;

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

function OrderCard({ order }: { order: QueueOrder }) {
  return (
    <Link href={`/distributor/orders/${order.id}`}>
      <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)] transition-shadow flex items-center justify-between">
        <div className="space-y-1">
          <p className="font-medium text-sm">Pedido #{order.id.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">{order.consumer_name}</p>
          <p className="text-xs text-muted-foreground">{order.address_summary}</p>
          <p className="text-xs text-muted-foreground">
            {order.total_items_qty} garraf{order.total_items_qty === 1 ? "ão" : "ões"} • {formatWindowLabel(order.delivery_window)}
          </p>
          <StatusPill status={order.status} />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right space-y-1">
            <p className="font-bold text-sm text-[#0041c8]">{formatCurrency(order.total_cents)}</p>
            {order.status === "SENT_TO_DISTRIBUTOR" && (
              <SlaCountdown deadlineIso={order.sla_deadline} />
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

function Section({
  label,
  orders,
}: {
  label: string;
  orders: QueueOrder[];
}) {
  if (orders.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        {label} <span className="ml-1 bg-[#0041c8]/10 text-[#0041c8] px-1.5 py-0.5 rounded-full">{orders.length}</span>
      </p>
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}

export default function DistributorQueuePage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?scope=distributor");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      // mantém estado anterior em caso de falha de rede
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Refetch quando o usuário retorna para a aba/window (ex.: voltou da tela de detalhe)
  useEffect(() => {
    window.addEventListener("focus", fetchOrders);
    return () => window.removeEventListener("focus", fetchOrders);
  }, [fetchOrders]);

  // Socket: novos pedidos chegam em tempo real
  useEffect(() => {
    const handler = (..._args: unknown[]) => {
      // Só faz fetch completo para garantir dados enriquecidos (consumer_name, sla_deadline)
      void fetchOrders();
    };
    on("new_order", handler);
    return () => off("new_order", handler);
  }, [on, off, fetchOrders]);

  const totalActive = orders.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading text-foreground">Fila de Pedidos</h1>
        <span className="text-xs bg-[#0041c8]/10 text-[#0041c8] font-medium px-2.5 py-1 rounded-full">
          {totalActive} {totalActive === 1 ? "ativo" : "ativos"}
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
          <p className="text-muted-foreground">Nenhum pedido ativo no momento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECTION_CONFIG.map(({ key, label, statuses }) => (
            <Section
              key={key}
              label={label}
              orders={orders.filter((o) => (statuses as readonly string[]).includes(o.status))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
