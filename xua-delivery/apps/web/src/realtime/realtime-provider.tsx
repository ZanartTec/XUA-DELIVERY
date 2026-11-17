"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { isRealtimeEventName } from "@xua/shared/realtime/events";
import { useAuthStore } from "@/src/store/auth";
import { createListenerRegistry, type ListenerRegistry } from "./listener-registry";
import { keysFor, LIVE_QUERY_KEYS } from "./invalidation-map";
import { createKeyCoalescer } from "./coalescer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Depois de quanto tempo com a aba oculta vale reler tudo ao voltar. */
const RESYNC_AFTER_HIDDEN_MS = 3_000;
/** Servidor recusou ou derrubou a conexão (login expirado, deploy): nova tentativa. */
const SERVER_REJECT_RETRY_MS = 30_000;

/**
 * Passe curto do socket, pedido a cada tentativa de conexão.
 *
 * Em produção o site e a API ficam em domínios diferentes: o cookie de sessão
 * é do site e não acompanha o handshake, que vai direto à API. A rota abaixo
 * passa pelo proxy `/api` do próprio site (com o cookie) e devolve um passe de
 * 60 s, uso único. Sem passe (falha de rede, logout), segue sem `token`: no
 * mesmo domínio (dev) o cookie ainda autentica.
 */
async function fetchSocketTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/socket-ticket", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { ticket?: unknown };
    return typeof body.ticket === "string" ? body.ticket : null;
  } catch {
    return null;
  }
}

export type RealtimeStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";

const RegistryContext = createContext<ListenerRegistry | null>(null);
const StatusContext = createContext<RealtimeStatus>("idle");

/**
 * Um socket por aba, vivo enquanto houver login (T3.1).
 *
 * - Todo evento do contrato passa pelo registro de ouvintes (corrige F2) e
 *   invalida as chaves do mapa, em lote (T3.3).
 * - Ao reconectar, ao voltar para a aba e ao voltar a ficar online, relê as
 *   chaves "ao vivo": o que se perdeu no meio aparece (T3.4, F3).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  // Estado da conexão marcado com o usuário a que pertence: ao trocar de login,
  // o estado antigo deixa de valer sem precisar de setState síncrono no efeito.
  const [connection, setConnection] = useState<{ userId: string; status: RealtimeStatus } | null>(null);
  const status: RealtimeStatus = !userId
    ? "idle"
    : connection?.userId === userId
      ? connection.status
      : "connecting";

  // Estável pela vida do provider: telas registram ouvintes antes do socket existir.
  const [registry] = useState(() =>
    createListenerRegistry((event, error) => {
      console.error(`[realtime] handler de "${event}" falhou`, error);
    })
  );

  useEffect(() => {
    if (!userId) return;
    const setStatus = (next: RealtimeStatus) => setConnection({ userId, status: next });

    const coalescer = createKeyCoalescer((keys) => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
    });
    const resync = () => coalescer.add(LIVE_QUERY_KEYS);

    const socket: Socket = io(API_URL, {
      withCredentials: true,
      // Chamado a cada (re)conexão: sempre um passe novo, nunca um já usado.
      auth: (cb) => {
        void fetchSocketTicket().then((ticket) => cb(ticket ? { token: ticket } : {}));
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      // Espalha as reconexões: depois de um deploy, nem todo mundo volta junto.
      randomizationFactor: 0.5,
    });

    let hasConnectedBefore = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenAt: number | null = null;

    const offlineNow = () => typeof navigator !== "undefined" && navigator.onLine === false;

    // Recusa no handshake ou desconexão pelo servidor desligam a reconexão
    // automática do socket.io; sem isto a aba ficaria parada para sempre.
    const scheduleManualRetry = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!socket.connected) socket.connect();
      }, SERVER_REJECT_RETRY_MS);
    };

    socket.on("connect", () => {
      setStatus("live");
      if (hasConnectedBefore) resync();
      hasConnectedBefore = true;
    });

    socket.on("disconnect", (reason) => {
      setStatus(offlineNow() ? "offline" : "reconnecting");
      if (reason === "io server disconnect") scheduleManualRetry();
    });

    socket.on("connect_error", () => {
      setStatus(offlineNow() ? "offline" : "reconnecting");
      if (!socket.active) scheduleManualRetry();
    });

    socket.onAny((event: string, payload: unknown) => {
      if (!isRealtimeEventName(event)) return;
      registry.emit(event, payload as never);
      coalescer.add(keysFor(event, payload as never));
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= RESYNC_AFTER_HIDDEN_MS) resync();
      hiddenAt = null;
      if (!socket.connected && !socket.active) socket.connect();
    };
    const onOnline = () => {
      setStatus(socket.connected ? "live" : "reconnecting");
      resync();
      if (!socket.connected) socket.connect();
    };
    const onOffline = () => setStatus("offline");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (retryTimer) clearTimeout(retryTimer);
      coalescer.dispose();
      socket.removeAllListeners();
      socket.offAny();
      socket.disconnect();
    };
  }, [userId, queryClient, registry]);

  return (
    <RegistryContext.Provider value={registry}>
      <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
    </RegistryContext.Provider>
  );
}

export function useRealtimeRegistry(): ListenerRegistry | null {
  return useContext(RegistryContext);
}

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(StatusContext);
}

/** `refetchInterval` de reserva: lento com o socket ao vivo, rápido sem ele (T3.5). */
export function useFallbackRefetchInterval(liveMs = 120_000, degradedMs = 20_000): number {
  const status = useRealtimeStatus();
  return useMemo(() => (status === "live" ? liveMs : degradedMs), [status, liveMs, degradedMs]);
}
