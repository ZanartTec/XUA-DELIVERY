"use client";

import { useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";

interface SlaCountdownProps {
  deadlineIso: string;
  className?: string;
  /** Texto antes do tempo restante (ex.: "Responder em"). */
  prefix?: string;
  /** Texto quando o prazo acaba. */
  expiredLabel?: string;
}

export function SlaCountdown({ deadlineIso, className, prefix, expiredLabel = "Prazo vencido" }: SlaCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineIso]);

  const remaining = calcRemaining(deadlineIso, now);
  const totalSeconds = Math.max(0, remaining);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const expired = remaining <= 0;

  const colorClass = expired
    ? "text-destructive"
    : totalSeconds < 60
      ? "text-destructive animate-pulse"
      : totalSeconds < 180
        ? "text-warning-foreground"
        : "text-success-foreground";

  return (
    <span
      className={cn(
        "tabular-nums font-mono text-sm font-semibold",
        colorClass,
        className
      )}
    >
      {expired
        ? expiredLabel
        : `${prefix ? `${prefix} ` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
    </span>
  );
}

function calcRemaining(deadlineIso: string, now = Date.now()): number {
  return Math.floor((new Date(deadlineIso).getTime() - now) / 1000);
}
