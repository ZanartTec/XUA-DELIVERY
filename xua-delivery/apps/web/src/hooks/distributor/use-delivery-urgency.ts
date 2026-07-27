"use client";

import { useEffect, useState } from "react";
import {
  getDeliveryUrgency,
  type DeliveryUrgency,
  type DeliveryUrgencyInput,
} from "@/src/lib/order-detail-format";

const TICK_MS = 60_000;

/** Dias/janela mudam devagar — 1 tick/minuto basta (diferente do SlaCountdown, que é 1s). */
export function useDeliveryUrgency(order: DeliveryUrgencyInput): DeliveryUrgency {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return getDeliveryUrgency(order, new Date(now));
}
