"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Truck, MapPin, ChevronRight, PackageOpen } from "lucide-react";

interface Delivery {
  order_id: string;
  consumer_name: string;
  address_line: string;
  status: string;
  delivery_window: string;
  sequence: number;
}

function DeliverySkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-56 rounded-lg bg-[#e1e3e4]" />
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-heading text-foreground">Entregas do dia</h1>
        <span className="text-xs bg-[#0041c8]/10 text-[#0041c8] font-medium px-2.5 py-1 rounded-full">
          {deliveries.length} entregas
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <DeliverySkeleton key={i} />)}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0041c8]/10 mb-4">
            <PackageOpen className="h-10 w-10 text-[#0041c8]/40" />
          </div>
          <p className="text-muted-foreground">Nenhuma entrega pendente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => (
            <Link key={d.order_id} href={`/driver/deliveries/${d.order_id}/otp`}>
              <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm hover:shadow-[0_4px_20px_rgba(0,26,64,0.10)] transition-shadow flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#0041c8]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-[#0041c8]">{d.sequence}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium truncate">{d.consumer_name}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {d.address_line}
                  </p>
                  <StatusPill status={d.status} />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">
                    {d.delivery_window === "morning" ? "Manhã" : "Tarde"}
                  </span>
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
