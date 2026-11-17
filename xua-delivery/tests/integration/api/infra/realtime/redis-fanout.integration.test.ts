import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import type Redis from "ioredis";

/**
 * Prova, com Redis real, o caminho que estava quebrado (F1) e o de várias
 * instâncias (F9):
 *   - duas "instâncias da API" com o adapter no mesmo Redis;
 *   - o "worker" publicando pelo redis-emitter (initRealtimeEmitter);
 *   - um cliente conectado só na instância B recebe os três.
 * Usa um prefixo próprio, então não interfere no Redis de desenvolvimento.
 */
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.REDIS_KEY_PREFIX = `xua:itest-${process.pid}-${Date.now()}`;
delete process.env.REALTIME_REDIS_ADAPTER;

const { createRealtimeRedisConnection, getRealtimeChannelKey } = await import("@api/infra/realtime/redis");
const { initRealtimeEmitter, closeRealtime, realtimePublisher } = await import("@api/infra/realtime/publisher");

interface Instance {
  io: Server;
  http: http.Server;
  url: string;
  redis: Redis[];
}

async function startInstance(key: string): Promise<Instance> {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  const pub = createRealtimeRedisConnection("pub");
  const sub = createRealtimeRedisConnection("sub");
  io.adapter(createAdapter(pub, sub, { key }));
  // Sem JWT aqui: a sala vem do handshake. A autenticação é coberta no unitário do gateway.
  io.on("connection", (socket) => {
    socket.join(String(socket.handshake.auth.room));
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  return {
    io,
    http: httpServer,
    url: `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
    redis: [pub, sub],
  };
}

async function stopInstance(instance: Instance): Promise<void> {
  instance.io.close();
  await Promise.all(instance.redis.map((client) => client.quit()));
}

function connect(url: string, room: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = connectClient(url, { transports: ["websocket"], reconnection: false, auth: { room } });
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

function nextEvent(client: ClientSocket, event: string, timeoutMs = 1500): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    client.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** O adapter leva alguns ms para assinar o canal depois de criado. */
async function waitForSubscriptions(instances: Instance[]): Promise<void> {
  await Promise.all(
    instances.flatMap((instance) =>
      instance.redis.map(
        (client) =>
          new Promise<void>((resolve) => (client.status === "ready" ? resolve() : client.once("ready", () => resolve())))
      )
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
}

let a: Instance;
let b: Instance;
let other: Instance;
let clientOnB: ClientSocket;
let clientOnOther: ClientSocket;

beforeAll(async () => {
  a = await startInstance(getRealtimeChannelKey());
  b = await startInstance(getRealtimeChannelKey());
  // Outro ambiente (ex.: produção) no mesmo Redis, com outro prefixo.
  other = await startInstance(`${getRealtimeChannelKey()}-outro-ambiente`);
  await waitForSubscriptions([a, b, other]);
  await initRealtimeEmitter();

  clientOnB = await connect(b.url, "distributor:dist-1");
  clientOnOther = await connect(other.url, "distributor:dist-1");
});

afterAll(async () => {
  clientOnB?.disconnect();
  clientOnOther?.disconnect();
  await closeRealtime();
  await Promise.all([a, b, other].filter(Boolean).map(stopInstance));
});

describe("tempo real entre processos via Redis", () => {
  it("evento emitido na instância A chega ao cliente conectado na instância B", async () => {
    const received = nextEvent(clientOnB, "order_status_changed");
    a.io.to("distributor:dist-1").emit("order_status_changed", { orderId: "o-a", status: "ACCEPTED_BY_DISTRIBUTOR" });
    await expect(received).resolves.toEqual({ orderId: "o-a", status: "ACCEPTED_BY_DISTRIBUTOR" });
  });

  it("evento publicado pelo worker (redis-emitter) chega à tela da distribuidora", async () => {
    const started = Date.now();
    const received = nextEvent(clientOnB, "new_order");
    realtimePublisher.publish("distributor:dist-1", "new_order", { orderId: "o-pix", status: "SENT_TO_DISTRIBUTOR" });

    await expect(received).resolves.toEqual({ orderId: "o-pix", status: "SENT_TO_DISTRIBUTOR" });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("outro ambiente no mesmo Redis (prefixo diferente) não recebe", async () => {
    const received = nextEvent(clientOnOther, "new_order", 500);
    realtimePublisher.publish("distributor:dist-1", "new_order", { orderId: "o-x", status: "SENT_TO_DISTRIBUTOR" });
    await expect(received).resolves.toBe("timeout");
  });

  it("sala de outra distribuidora não recebe", async () => {
    const received = nextEvent(clientOnB, "new_order", 500);
    realtimePublisher.publish("distributor:dist-2", "new_order", { orderId: "o-y", status: "SENT_TO_DISTRIBUTOR" });
    await expect(received).resolves.toBe("timeout");
  });
});
