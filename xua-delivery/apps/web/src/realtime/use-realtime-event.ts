"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEventName } from "@xua/shared/realtime/events";
import type { RealtimeHandler } from "./listener-registry";
import { useRealtimeRegistry } from "./realtime-provider";

/**
 * Ouve um evento de tempo real (T3.2). O handler fica numa ref, então pode
 * ser uma função nova a cada render sem re-registrar. Invalidação de cache já
 * é automática no provider: use isto só para efeitos de tela (toast, OTP).
 */
export function useRealtimeEvent<E extends RealtimeEventName>(event: E, handler: RealtimeHandler<E>): void {
  const registry = useRealtimeRegistry();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!registry) return;
    return registry.on(event, (payload) => handlerRef.current(payload));
  }, [registry, event]);
}
