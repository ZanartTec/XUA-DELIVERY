"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { DeliveryWindow, OrderStatus } from "@/src/types/enums";
import { formatCurrency, formatDate } from "@/src/lib/utils";
import {
  ClipboardList,
  ChevronRight,
  Check,
  Truck,
  Home,
  Droplets,
} from "lucide-react";
import type { Order } from "@/src/types";

/* ── helpers ── */
const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  SENT_TO_DISTRIBUTOR: "A caminho",
  ACCEPTED_BY_DISTRIBUTOR: "A caminho",
  OUT_FOR_DELIVERY: "A caminho",
  DELIVERED: "Entregue",
};

function getProgress(status: string) {
  const s = status as OrderStatus;
  if (s === OrderStatus.DELIVERED) return { step: 3, pct: "w-full" };
  if (
    s === OrderStatus.OUT_FOR_DELIVERY ||
    s === OrderStatus.ACCEPTED_BY_DISTRIBUTOR ||
    s === OrderStatus.SENT_TO_DISTRIBUTOR
  )
    return { step: 2, pct: "w-2/3" };
  return { step: 1, pct: "w-1/3" };
}

function isActive(order: Order) {
  const terminal = [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.DELIVERY_FAILED,
    OrderStatus.REJECTED_BY_DISTRIBUTOR,
  ] as string[];
  return !terminal.includes(order.status);
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function OrderSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="space-y-3 p-6">
        <div className="h-5 w-40 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-56 rounded-lg bg-[#e1e3e4]" />
        <div className="h-8 w-full rounded-lg bg-[#e1e3e4]" />
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

  const activeOrders = orders.filter(isActive);
  const pastOrders = orders.filter((o) => !isActive(o));

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-5 pt-5 mb-4">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary mb-0.5">
          Acompanhamento
        </p>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-[#191c1d]">
          Pedidos Ativos
        </h1>
      </div>

      {loading ? (
        <div className="space-y-3 px-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-5">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#5697E9]/15">
            <ClipboardList className="h-8 w-8 text-[#5697E9]/50" />
          </div>
          <p className="text-[#737688]">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <>
          {/* ── Active Orders ── */}
          {activeOrders.length > 0 && (
            <div className="px-5 mb-6">
              <div className="space-y-5">
                {activeOrders.map((order) => {
                  const { step, pct } = getProgress(order.status);
                  return (
                    <Link key={order.id} href={`/orders/${order.id}`} className="block">
                      <div className="bg-[#f3f4f5] rounded-2xl p-4 relative overflow-hidden">
                        {/* decorative blur */}
                        <div className="absolute top-0 right-0 w-48 h-48 bg-[#5697E9]/8 rounded-full -mr-16 -mt-16 blur-3xl" />

                        <div className="relative z-10">
                          {/* Product info */}
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                              <Droplets className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-heading text-base font-bold text-[#191c1d] leading-tight">
                                Pedido #{shortId(order.id)}
                              </h3>
                              <p className="text-xs text-[#737688] font-medium truncate">
                                {formatDate(order.delivery_date)} •{" "}
                                <span className="text-primary">
                                  {formatCurrency(order.total_cents)}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Progress tracker */}
                          <div className="relative pb-1">
                            <div className="absolute top-3 left-0 w-full h-0.5 bg-[#e1e3e4] rounded-full">
                              <div
                                className={`h-full bg-[#00E0FF] rounded-full transition-all ${pct}`}
                              />
                            </div>
                            <div className="relative flex justify-between">
                              {/* Step 1 */}
                              <div className="flex flex-col items-center gap-1.5">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                    step >= 1
                                      ? "bg-[#00E0FF] text-[#001735]"
                                      : "bg-[#e1e3e4] text-[#737688]"
                                  }`}
                                >
                                  <Check className="h-3 w-3" />
                                </div>
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wide ${
                                    step >= 1 ? "text-[#001735]" : "text-[#b0b3c6]"
                                  }`}
                                >
                                  Confirmado
                                </span>
                              </div>
                              {/* Step 2 */}
                              <div className="flex flex-col items-center gap-1.5">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                    step >= 2
                                      ? "bg-[#00E0FF] text-[#001735]"
                                      : "bg-[#e1e3e4] text-[#737688]"
                                  }`}
                                >
                                  <Truck className="h-3 w-3" />
                                </div>
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wide ${
                                    step >= 2 ? "text-[#001735]" : "text-[#b0b3c6]"
                                  }`}
                                >
                                  A caminho
                                </span>
                              </div>
                              {/* Step 3 */}
                              <div className="flex flex-col items-center gap-1.5">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                    step >= 3
                                      ? "bg-[#00E0FF] text-[#001735]"
                                      : "bg-[#e1e3e4] text-[#737688]"
                                  }`}
                                >
                                  <Home className="h-3 w-3" />
                                </div>
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wide ${
                                    step >= 3 ? "text-[#001735]" : "text-[#b0b3c6]"
                                  }`}
                                >
                                  Entregue
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Past Deliveries ── */}
          {pastOrders.length > 0 && (
            <section className="px-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg font-extrabold text-[#191c1d]">
                  Entregas Anteriores
                </h2>
              </div>

              <div className="space-y-3">
                {pastOrders.map((order) => {
                  const d = new Date(order.delivery_date);
                  const month = d
                    .toLocaleDateString("pt-BR", { month: "short" })
                    .replace(".", "")
                    .toUpperCase();
                  const day = d.getDate().toString().padStart(2, "0");

                  return (
                    <Link key={order.id} href={`/orders/${order.id}`} className="block">
                      <div className="bg-white p-4 rounded-xl flex items-center justify-between group transition-all duration-200 hover:bg-[#f3f4f5] shadow-sm overflow-hidden">
                        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
                          {/* Date block */}
                          <div className="text-center w-10 shrink-0">
                            <p className="text-[9px] font-bold uppercase text-[#737688]">
                              {month}
                            </p>
                            <p className="text-lg font-heading font-black text-[#191c1d] leading-tight">
                              {day}
                            </p>
                          </div>
                          <div className="h-8 w-px bg-[#e1e3e4] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[#191c1d] truncate">
                              Pedido #{shortId(order.id)}
                            </p>
                            <p className="text-xs text-[#737688] font-medium truncate">
                              {order.delivery_window === DeliveryWindow.MORNING
                                ? "Manhã"
                                : "Tarde"}{" "}
                              •{" "}
                              {STATUS_LABELS[order.status] ??
                                order.status.replace(/_/g, " ").toLowerCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="font-heading font-bold text-sm text-[#191c1d]">
                            {formatCurrency(order.total_cents)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-[#737688] group-hover:text-primary transition-colors shrink-0" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Upsell Banner ── */}
          <div className="mx-5 mt-6 rounded-2xl overflow-hidden relative h-36 bg-[#191c1d] shadow-xl">
            <div className="absolute inset-0 bg-linear-to-r from-[#191c1d] to-transparent" />
            <div className="absolute inset-0 flex items-center px-6">
              <div className="max-w-xs relative z-10">
                <h4 className="text-white font-heading text-base font-extrabold mb-1">
                  Assine e Economize 15%
                </h4>
                <p className="text-[#b6c4ff] text-xs mb-3">
                  Monte um plano recorrente para sua entrega semanal.
                </p>
                <Link
                  href="/subscription"
                  className="inline-block bg-white text-[#191c1d] px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform"
                >
                  Ver Planos
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
