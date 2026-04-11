"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/src/lib/utils";

type RouteStop = {
  order_id: string;
  consumer_name: string;
  consumer_phone: string | null;
  total_items_qty: number;
  status: string;
  status_label: string;
  status_tone: "success" | "danger" | "warning" | "neutral";
  address_line: string;
  maps_url: string;
};

type RouteGroup = {
  zone_name: string;
  delivery_window: "MORNING" | "AFTERNOON";
  stops: RouteStop[];
};

type RouteDetail = {
  id: string;
  date: string;
  total_stops: number;
  delivered_stops: number;
  pending_stops: number;
  groups: RouteGroup[];
};

function windowLabel(window: RouteGroup["delivery_window"]) {
  return window === "MORNING" ? "Manhã" : "Tarde";
}

function toneClass(tone: RouteStop["status_tone"]) {
  if (tone === "success") return "bg-green-100 text-green-700";
  if (tone === "danger") return "bg-red-100 text-red-700";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoute() {
      try {
        const response = await fetch(`/api/distributor/routes/${id}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? `Erro ${response.status}`);
        }
        setRoute(data.route ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar rota");
      } finally {
        setLoading(false);
      }
    }

    void loadRoute();
  }, [id]);

  const routeDateLabel = useMemo(() => {
    if (!route?.date) return id;
    return formatDate(route.date);
  }, [id, route?.date]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-2xl bg-white/90 p-5 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
            <div className="h-4 w-48 rounded bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold font-heading">Rota do dia</h1>
          <p className="text-sm text-muted-foreground">{routeDateLabel}</p>
        </div>
        <Link
          href="/distributor/queue"
          className="rounded-xl border border-[#d9dde3] px-3 py-2 text-sm text-[#0b2a59] transition-colors hover:bg-[#f5f6f7]"
        >
          Voltar para pedidos
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">Paradas totais</p>
          <p className="mt-1 text-3xl font-bold text-[#0b2a59]">{route?.total_stops ?? 0}</p>
        </div>
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">Pendentes</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{route?.pending_stops ?? 0}</p>
        </div>
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">Entregues</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{route?.delivered_stops ?? 0}</p>
        </div>
      </div>

      {!route || route.groups.length === 0 ? (
        <div className="rounded-2xl bg-white/95 p-6 text-center text-sm text-muted-foreground shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
          Nenhuma parada operacional encontrada para esta data.
        </div>
      ) : (
        route.groups.map((group) => (
          <section
            key={`${group.zone_name}-${group.delivery_window}`}
            className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold font-heading">{group.zone_name}</p>
                <p className="text-xs text-muted-foreground">Janela {windowLabel(group.delivery_window)}</p>
              </div>
              <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#0b2a59]">
                {group.stops.length} paradas
              </span>
            </div>

            <div className="space-y-3">
              {group.stops.map((stop) => (
                <article
                  key={stop.order_id}
                  className="rounded-xl border border-[#edf0f3] bg-[#fcfcfd] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[#0b2a59]">{stop.consumer_name}</p>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${toneClass(stop.status_tone)}`}>
                          {stop.status_label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{stop.address_line}</p>
                      <p className="text-sm text-muted-foreground">
                        {stop.total_items_qty} item(ns){stop.consumer_phone ? ` • ${stop.consumer_phone}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/distributor/orders/${stop.order_id}`}
                        className="rounded-xl border border-[#d9dde3] px-3 py-2 text-sm text-[#0b2a59] transition-colors hover:bg-[#f5f6f7]"
                      >
                        Ver pedido
                      </Link>
                      <button
                        type="button"
                        onClick={() => window.open(stop.maps_url, "_blank", "noopener,noreferrer")}
                        className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        Abrir no Google Maps
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
