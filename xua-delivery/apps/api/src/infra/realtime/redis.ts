import Redis from "ioredis";
import { createLogger } from "../logger";
import { getRedisUrl, REDIS_KEY_PREFIX } from "../redis/config";

const log = createLogger("realtime-redis");

/**
 * Canal pub/sub do Socket.IO. Precisa ser idêntico no adapter (API) e no
 * emitter (worker) — senão o worker publica num canal que ninguém escuta.
 * O prefixo por ambiente separa dev/staging/prod quando dividem o Redis.
 */
export function getRealtimeChannelKey(): string {
  return `${REDIS_KEY_PREFIX}:socket.io`;
}

/** Ligado por padrão; `REALTIME_REDIS_ADAPTER=off` desliga sem deploy de código. */
export function isRealtimeRedisEnabled(): boolean {
  return process.env.REALTIME_REDIS_ADAPTER !== "off";
}

/**
 * Conexão dedicada ao tempo real. Usa o mesmo Redis da fila (API e worker
 * sempre o têm configurado). Não reaproveita o cliente de cache nem as
 * conexões do BullMQ: a conexão de subscribe fica presa nesse modo.
 */
export function createRealtimeRedisConnection(name: "pub" | "sub" | "emitter"): Redis {
  const client = new Redis(getRedisUrl("queue"), {
    connectionName: `xua-realtime-${name}`,
    // A de subscribe espera reconectar indefinidamente; as de publish falham
    // rápido — um evento atrasado minutos não serve, e a tela tem polling.
    maxRetriesPerRequest: name === "sub" ? null : 3,
  });

  client.on("error", (err: Error) => {
    log.error({ err, connection: name }, "Realtime Redis connection error");
  });

  return client;
}
