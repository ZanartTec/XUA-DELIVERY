"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/src/components/shared/status-pill";
import { Card, CardContent } from "@/src/components/ui/card";
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
    <Card className="animate-pulse">
      <CardContent className="py-3 space-y-2">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="h-3 w-56 rounded bg-muted" />
      </CardContent>
    </Card>
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
        <h1 className="text-xl font-bold text-foreground">Entregas do dia</h1>
        <span className="text-xs bg-accent/10 text-accent font-medium px-2 py-1 rounded-full">
          {deliveries.length} entregas
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <DeliverySkeleton key={i} />)}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PackageOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Nenhuma entrega pendente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => (
            <Link key={d.order_id} href={`/driver/deliveries/${d.order_id}/otp`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-accent">{d.sequence}</span>
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
