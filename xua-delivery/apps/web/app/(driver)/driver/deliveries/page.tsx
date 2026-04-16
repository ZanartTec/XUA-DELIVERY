"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { MapPin, ChevronRight, PackageOpen, Phone, Droplets, Truck, CheckCircle2 } from "lucide-react";

interface Delivery {
  order_id: string;
  consumer_name: string;
  consumer_phone: string | null;
  address_line: string;
  status: string;
  delivery_window: "MORNING" | "AFTERNOON";
  sequence: number;
  total_items_qty: number;
}

function canAdvanceToOtp(status: string) {
  return status === "OUT_FOR_DELIVERY";
}

function isCompleted(status: string) {
  return status === "DELIVERED" || status === "DELIVERY_FAILED";
}

function DeliverySkeleton() {
  return (
    <div className="animate-pulse rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-[#eef0f3]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-36 rounded-full bg-[#e1e3e4]" />
          <div className="h-3 w-52 rounded-full bg-[#eef0f3]" />
          <div className="h-3 w-28 rounded-full bg-[#eef0f3]" />
        </div>
      </div>
    </div>
  );
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

  const pending = deliveries.filter((d) => canAdvanceToOtp(d.status));
  const done = deliveries.filter((d) => isCompleted(d.status));

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <section className="relative overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_28%),linear-gradient(135deg,#0038b0_0%,#004de1_52%,#2a84ff_100%)] px-5 py-6 text-white shadow-[0_22px_50px_rgba(27,74,154,0.28)]">
        <div className="absolute -right-10 top-8 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">Operação do motorista</p>
              <h1 className="mt-2 font-heading text-[2rem] leading-none font-extrabold">Minhas entregas</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/80">
                Confirme cada entrega com o código OTP do cliente.
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[24px] bg-white/14 backdrop-blur">
              <Truck className="h-7 w-7 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[24px] bg-white/12 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Pendentes</p>
              <p className="mt-1 font-heading text-2xl font-extrabold">{loading ? "—" : pending.length}</p>
            </div>
            <div className="rounded-[24px] bg-white/12 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Concluídas</p>
              <p className="mt-1 font-heading text-2xl font-extrabold">{loading ? "—" : done.length}</p>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <DeliverySkeleton key={i} />)}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="rounded-[28px] bg-white px-6 py-12 text-center shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#5697E9]/15 text-[#5697E9]">
            <PackageOpen className="h-8 w-8" />
          </div>
          <h2 className="mt-4 font-heading text-xl font-extrabold text-[#0d1b2f]">Nenhuma entrega</h2>
          <p className="mt-2 text-sm text-[#5d6473]">Quando um pedido for despachado para você, aparecerá aqui.</p>
        </div>
      ) : (
        <>
          {/* Pendentes */}
          {pending.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7d8494]">Em rota</p>
                  <h2 className="mt-1 font-heading text-xl font-extrabold text-[#0d1b2f]">Aguardando entrega</h2>
                </div>
                <span className="rounded-full bg-[#5697E9]/10 px-3 py-1 text-sm font-semibold text-primary">
                  {pending.length}
                </span>
              </div>

              {pending.map((d) => (
                <Link key={d.order_id} href={`/driver/deliveries/${d.order_id}/otp`} className="group block">
                  <article className="rounded-[28px] bg-white px-4 py-4 shadow-[0_12px_40px_rgba(0,26,64,0.08)] ring-1 ring-[#e4e8f1] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(0,26,64,0.12)]">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#5697E9]/15 text-[#1B4A9A]">
                        <span className="font-heading text-lg font-extrabold">{d.sequence}</span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-semibold text-[#0d1b2f] truncate">{d.consumer_name}</p>
                        <p className="text-xs text-[#5d6473] truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {d.address_line}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-[#7d8494]">
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="h-3 w-3" />
                            {d.total_items_qty} garrafão{d.total_items_qty !== 1 ? "ões" : ""}
                          </span>
                          {d.consumer_phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {d.consumer_phone}
                            </span>
                          )}
                          <span className="ml-auto rounded-full bg-[#fff2dd] px-2 py-0.5 text-[10px] font-semibold text-[#7a4700]">
                            {d.delivery_window === "MORNING" ? "Manhã" : "Tarde"}
                          </span>
                        </div>
                      </div>

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#5697E9]/15 text-[#5697E9] transition-transform duration-200 group-hover:translate-x-0.5">
                        <ChevronRight className="h-5 w-5" />
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </section>
          )}

          {/* Concluídas */}
          {done.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7d8494]">Histórico do dia</p>
                  <h2 className="mt-1 font-heading text-xl font-extrabold text-[#0d1b2f]">Concluídas</h2>
                </div>
                <span className="rounded-full bg-[#e7f7ef] px-3 py-1 text-sm font-semibold text-[#166534]">
                  {done.length}
                </span>
              </div>

              {done.map((d) => (
                <article key={d.order_id} className="rounded-[28px] bg-white px-4 py-4 opacity-75 shadow-[0_8px_24px_rgba(0,26,64,0.05)] ring-1 ring-[#e4e8f1]">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e7f7ef] text-[#166534]">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-[#0d1b2f] truncate">{d.consumer_name}</p>
                      <p className="text-xs text-[#5d6473] truncate flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {d.address_line}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-[#7d8494]">
                        <span className="inline-flex items-center gap-1">
                          <Droplets className="h-3 w-3" />
                          {d.total_items_qty} garrafão{d.total_items_qty !== 1 ? "ões" : ""}
                        </span>
                      </div>
                    </div>

                    <StatusPill status={d.status} />
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
