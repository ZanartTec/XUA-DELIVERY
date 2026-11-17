"use client";

import { cn } from "@/src/lib/utils";
import { useRealtimeStatus, type RealtimeStatus } from "./realtime-provider";

const LABEL: Record<Exclude<RealtimeStatus, "idle">, string> = {
  connecting: "Conectando…",
  live: "Ao vivo",
  reconnecting: "Reconectando…",
  offline: "Sem conexão",
};

/** Ponto discreto de estado do tempo real (T3.6) para distribuidora, motorista e ops. */
export function RealtimeIndicator({ className }: { className?: string }) {
  const status = useRealtimeStatus();
  if (status === "idle") return null;

  return (
    <span
      role="status"
      aria-live="polite"
      data-realtime-status={status}
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          status === "live" && "bg-emerald-500",
          (status === "connecting" || status === "reconnecting") && "animate-pulse bg-amber-500",
          status === "offline" && "bg-muted-foreground/50"
        )}
      />
      {LABEL[status]}
    </span>
  );
}
