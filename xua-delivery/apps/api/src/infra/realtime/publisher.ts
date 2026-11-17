import type Redis from "ioredis";
import { Emitter } from "@socket.io/redis-emitter";
import type { RealtimeEventName, RealtimePayloads } from "@xua/shared/realtime/events";
import { createLogger } from "../logger";
import {
  createRealtimeRedisConnection,
  getRealtimeChannelKey,
  isRealtimeRedisEnabled,
} from "./redis";

const log = createLogger("realtime");

/**
 * O que o publicador precisa de um transporte. Tanto o `Server` do Socket.IO
 * (API) quanto o `Emitter` do redis-emitter (worker) têm essa forma.
 */
export interface RealtimeTransport {
  to(room: string): { emit(event: string, ...args: unknown[]): unknown };
}

type Mode = "server" | "emitter" | "disabled";

let transport: RealtimeTransport | null = null;
let mode: Mode | null = null;
let emitterConnection: Redis | null = null;

/** API: emite pelo próprio Socket.IO (que, com o adapter, replica via Redis). */
export function attachRealtimeServer(io: RealtimeTransport): void {
  transport = io;
  mode = "server";
  log.info("Realtime publisher attached to Socket.IO server");
}

/**
 * Worker (ou qualquer processo sem servidor HTTP): publica direto no canal
 * Redis que o adapter da API escuta. Sem isso, o que o worker emite se perde.
 */
export async function initRealtimeEmitter(): Promise<void> {
  if (!isRealtimeRedisEnabled()) {
    mode = "disabled";
    log.warn("Realtime emitter disabled (REALTIME_REDIS_ADAPTER=off)");
    return;
  }

  emitterConnection = createRealtimeRedisConnection("emitter");
  transport = new Emitter(emitterConnection, { key: getRealtimeChannelKey() }) as unknown as RealtimeTransport;
  mode = "emitter";
  log.info({ key: getRealtimeChannelKey() }, "Realtime emitter initialized");
}

export async function closeRealtime(): Promise<void> {
  transport = null;
  mode = null;
  if (emitterConnection) {
    try {
      await emitterConnection.quit();
    } catch (err) {
      log.warn({ err }, "Failed to close realtime emitter connection");
    }
    emitterConnection = null;
  }
}

export function getRealtimeMode(): Mode | null {
  return mode;
}

export const realtimePublisher = {
  /**
   * Emite um evento para uma sala. Nunca lança: é chamado depois do commit, e
   * uma falha de tempo real não pode virar erro numa operação já gravada — a
   * tela se recupera pelo resync/polling.
   */
  publish<E extends RealtimeEventName>(room: string, event: E, payload: RealtimePayloads[E]): void {
    if (mode === "disabled") {
      log.debug({ room, event }, "Realtime disabled — event not published");
      return;
    }
    if (!transport) {
      log.error({ room, event }, "Realtime publisher not initialized — event lost");
      return;
    }
    try {
      transport.to(room).emit(event, payload);
    } catch (err) {
      log.warn({ err, room, event }, "Realtime publish failed");
    }
  },
};
