/**
 * Teste de carga do tempo real (seção 4.6 do plano). Fora do CI.
 *
 * Cenário: 2 instâncias da API (processos filhos com o gateway real e o
 * adapter Redis) + 50 distribuidoras × 3 abas + 400 clientes ≈ 550 sockets.
 * 300 pedidos em 5 min: cada pedido gera `new_order` na sala da distribuidora
 * e `order_status_changed` na sala do cliente. Metade sai pelo redis-emitter
 * (caminho do worker), metade de dentro de uma instância (caminho da API).
 * As abas de uma mesma distribuidora ficam espalhadas entre as instâncias, então
 * quase todo evento precisa atravessar o Redis.
 *
 * Metas: p95 de entrega < 1 s, 0 eventos na sala errada, 100% entregues,
 * CPU de cada instância < 50% de um núcleo.
 *
 * Rodar (Redis local de pé; usa um prefixo próprio, não interfere na API de dev):
 *   cd apps/api && node --env-file=.env --import tsx ../../tests/load/realtime-load.ts
 * Opções: LOAD_LOG_LEVEL=warn LOAD_ORDERS=300 LOAD_DURATION_S=300 LOAD_DISTRIBUTORS=50 LOAD_TABS=3 LOAD_CONSUMERS=400
 */
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { io as connectClient } from "socket.io-client";

// Roda como CommonJS (tsx sem "type": "module" na raiz).
const here = __dirname;

const ORDERS = Number(process.env.LOAD_ORDERS ?? 300);
const DURATION_S = Number(process.env.LOAD_DURATION_S ?? 300);
const DISTRIBUTORS = Number(process.env.LOAD_DISTRIBUTORS ?? 50);
const TABS = Number(process.env.LOAD_TABS ?? 3);
const CONSUMERS = Number(process.env.LOAD_CONSUMERS ?? 400);
const INSTANCES = 2;

// Prefixo exclusivo: canal Redis do teste separado do canal da API de dev.
process.env.REDIS_KEY_PREFIX = `xua:loadtest:${randomUUID().slice(0, 8)}`;
process.env.REALTIME_REDIS_ADAPTER = "on";
process.env.LOG_LEVEL = process.env.LOAD_LOG_LEVEL ?? "warn";

// Importados depois de ajustar o env: o prefixo é lido no carregamento.
/* eslint-disable @typescript-eslint/no-require-imports */
const { signToken } = require("../../apps/api/src/infra/auth/jwt") as typeof import("../../apps/api/src/infra/auth/jwt");
const { initRealtimeEmitter, realtimePublisher, closeRealtime } =
  require("../../apps/api/src/infra/realtime/publisher") as typeof import("../../apps/api/src/infra/realtime/publisher");
const { rooms } = require("../../apps/api/src/infra/realtime/rooms") as typeof import("../../apps/api/src/infra/realtime/rooms");
/* eslint-enable @typescript-eslint/no-require-imports */

type Stats = { cpuMs: number; wallMs: number; sockets: number; rssMb: number };

function startInstance(): Promise<{ child: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(here, "realtime-load.server.ts"), [], {
      execArgv: ["--import", "tsx"],
      env: process.env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    child.once("message", (msg: { type: string; port: number }) => {
      if (msg.type === "ready") resolve({ child, port: msg.port });
    });
    child.once("error", reject);
  });
}

function ask<T>(child: ChildProcess, type: string): Promise<T> {
  return new Promise((resolve) => {
    const onMessage = (msg: { type: string } & T) => {
      if (msg.type === type) {
        child.off("message", onMessage);
        resolve(msg);
      }
    };
    child.on("message", onMessage);
    child.send({ type });
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const latencies: number[] = [];
let misdelivered = 0;
let connectErrors = 0;
const received = new Map<string, number>(); // `${orderId}:${role}` → entregas

async function main() {
  console.log(`[load] prefixo ${process.env.REDIS_KEY_PREFIX}; subindo ${INSTANCES} instâncias…`);
  const instances = await Promise.all(Array.from({ length: INSTANCES }, startInstance));
  await initRealtimeEmitter();

  // --- Conexões ---
  const distributors = Array.from({ length: DISTRIBUTORS }, () => ({
    id: randomUUID(),
    adminId: randomUUID(),
  }));
  const consumers = Array.from({ length: CONSUMERS }, () => randomUUID());
  const sockets: ReturnType<typeof connectClient>[] = [];

  async function connect(token: string, instance: number, onEvent: (event: string, payload: Record<string, unknown>) => void) {
    const socket = connectClient(`http://localhost:${instances[instance].port}`, {
      transports: ["websocket"],
      reconnection: false,
      auth: { token },
    });
    sockets.push(socket);
    socket.onAny((event: string, payload: Record<string, unknown>) => onEvent(event, payload));
    await new Promise<void>((resolve) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", () => {
        connectErrors++;
        resolve();
      });
    });
  }

  function record(event: string, payload: Record<string, unknown>, ok: boolean, role: string) {
    if (!ok) {
      misdelivered++;
      return;
    }
    latencies.push(Date.now() - Number(payload.sentAt));
    const key = `${payload.orderId}:${role}`;
    received.set(key, (received.get(key) ?? 0) + 1);
  }

  const connectStart = Date.now();
  const tasks: Promise<void>[] = [];
  let slot = 0;
  for (const dist of distributors) {
    const token = await signToken({ sub: dist.adminId, role: "distributor_admin", name: "Carga", distributor_id: dist.id });
    for (let tab = 0; tab < TABS; tab++) {
      tasks.push(
        connect(token, slot++ % INSTANCES, (event, payload) => {
          if (event === "new_order") record(event, payload, payload.distributorId === dist.id, "distributor");
          else misdelivered++; // aba de distribuidora não deve receber evento de cliente
        })
      );
    }
  }
  for (const consumerId of consumers) {
    const token = await signToken({ sub: consumerId, role: "consumer", name: "Carga" });
    tasks.push(
      connect(token, slot++ % INSTANCES, (event, payload) => {
        if (event === "order_status_changed") record(event, payload, payload.consumerId === consumerId, "consumer");
        else misdelivered++;
      })
    );
  }
  await Promise.all(tasks);
  const connectMs = Date.now() - connectStart;
  const connected = sockets.filter((s) => s.connected).length;
  console.log(`[load] ${connected}/${sockets.length} sockets conectados em ${connectMs} ms (erros: ${connectErrors})`);

  // --- Pedidos ---
  for (const { child } of instances) child.send({ type: "reset-stats" });
  const intervalMs = (DURATION_S * 1000) / ORDERS;
  const started = Date.now();
  for (let i = 0; i < ORDERS; i++) {
    const dist = distributors[i % DISTRIBUTORS];
    const consumerId = consumers[i % CONSUMERS];
    const orderId = randomUUID();
    const sentAt = Date.now();
    const newOrder = { orderId, status: "SENT_TO_DISTRIBUTOR", distributorId: dist.id, sentAt };
    const statusChanged = { orderId, status: "SENT_TO_DISTRIBUTOR", consumerId, sentAt };

    if (i % 2 === 0) {
      // caminho do worker: redis-emitter
      realtimePublisher.publish(rooms.distributor(dist.id), "new_order", newOrder as never);
      realtimePublisher.publish(rooms.consumer(consumerId), "order_status_changed", statusChanged as never);
    } else {
      // caminho da API: publica de dentro de uma instância (alternando)
      const child = instances[(i >> 1) % INSTANCES].child;
      child.send({ type: "publish", room: rooms.distributor(dist.id), event: "new_order", payload: newOrder });
      child.send({ type: "publish", room: rooms.consumer(consumerId), event: "order_status_changed", payload: statusChanged });
    }

    if ((i + 1) % 50 === 0) console.log(`[load] ${i + 1}/${ORDERS} pedidos publicados`);
    const next = started + (i + 1) * intervalMs;
    await new Promise((r) => setTimeout(r, Math.max(0, next - Date.now())));
  }
  await new Promise((r) => setTimeout(r, 3_000)); // dreno

  const stats = await Promise.all(instances.map(({ child }) => ask<Stats>(child, "stats")));

  // --- Relatório ---
  const expected = ORDERS * (TABS + 1);
  const delivered = latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const report = {
    sockets: { total: sockets.length, connected, connectErrors, connectMs },
    orders: ORDERS,
    durationS: Math.round((Date.now() - started) / 1000),
    deliveries: { expected, delivered, missing: expected - delivered, misdelivered },
    latencyMs: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1] ?? NaN,
    },
    instances: stats.map((s, idx) => ({
      instance: idx + 1,
      sockets: s.sockets,
      cpuPctOfOneCore: Number(((s.cpuMs / s.wallMs) * 100).toFixed(1)),
      rssMb: s.rssMb,
    })),
  };
  const pass =
    report.latencyMs.p95 < 1000 &&
    misdelivered === 0 &&
    delivered === expected &&
    connectErrors === 0 &&
    report.instances.every((i) => i.cpuPctOfOneCore < 50);

  console.log(JSON.stringify(report, null, 2));
  console.log(pass ? "[load] RESULTADO: APROVADO" : "[load] RESULTADO: REPROVADO");

  for (const socket of sockets) socket.disconnect();
  for (const { child } of instances) child.send({ type: "close" });
  await closeRealtime();
  setTimeout(() => process.exit(pass ? 0 : 1), 1_000);
}

main().catch((err) => {
  console.error("[load] falhou", err);
  process.exit(1);
});
