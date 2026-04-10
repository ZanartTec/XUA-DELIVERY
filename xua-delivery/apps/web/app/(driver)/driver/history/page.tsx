"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock3, MapPin, PackageOpen, Phone, TriangleAlert } from "lucide-react";
import { StatusPill } from "@/src/components/shared/status-pill";

interface DriverHistoryItem {
  order_id: string;
  consumer_name: string;
  consumer_phone: string | null;
  address_line: string;
  status: string;
  delivery_window: "MORNING" | "AFTERNOON";
  total_items_qty: number;
  occurred_at: string;
  failure_reason: string | null;
}

function formatOccurrence(value: string) {
  return format(new Date(value), "dd 'de' MMM • HH:mm", { locale: ptBR });
}

function HistorySkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)]">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-56 rounded-lg bg-[#e1e3e4]" />
        <div className="h-3 w-28 rounded-lg bg-[#e1e3e4]" />
      </div>
    </div>
  );
}

export default function DriverHistoryPage() {
  const [history, setHistory] = useState<DriverHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/driver/deliveries/history")
      .then((response) => response.json())
      .then((data) => setHistory(data.deliveries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Historico de entregas</h1>
          <p className="text-sm text-muted-foreground">Entregas concluídas e falhas registradas pelo motorista.</p>
        </div>
        <span className="rounded-full bg-[#0041c8]/10 px-2.5 py-1 text-xs font-medium text-[#0041c8]">
          {history.length} registro(s)
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => <HistorySkeleton key={index} />)}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#0041c8]/10">
            <PackageOpen className="h-10 w-10 text-[#0041c8]/40" />
          </div>
          <p className="text-muted-foreground">Nenhum registro encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <div key={item.order_id} className="space-y-3 rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-foreground">{item.consumer_name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatOccurrence(item.occurred_at)} • {item.delivery_window === "MORNING" ? "Manhã" : "Tarde"}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{item.address_line}</span>
                </p>
                <p>{item.total_items_qty} garrafão(ões)</p>
                {item.consumer_phone && (
                  <p className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {item.consumer_phone}
                  </p>
                )}
              </div>

              {item.failure_reason && (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                  <p className="flex items-center gap-2 font-medium">
                    <TriangleAlert className="h-4 w-4" />
                    Motivo da falha
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">{item.failure_reason}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}