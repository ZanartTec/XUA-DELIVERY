import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import type { Server } from "socket.io";

/**
 * Gateway de verdade (servidor HTTP em porta efêmera + socket.io-client), com
 * JWT, blacklist e troca de senha simulados. Prova autenticação no handshake,
 * entrada nas salas certas e o isolamento entre distribuidoras.
 */
const mocks = vi.hoisted(() => ({
  tokens: new Map<string, Record<string, unknown>>(),
  blacklisted: new Set<string>(),
  stale: new Set<string>(),
  usedTickets: new Set<string>(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@api/infra/auth/jwt", () => ({
  verifyToken: async (token: string) => {
    const payload = mocks.tokens.get(token);
    if (!payload) throw new Error("invalid");
    return payload;
  },
  isSocketTicket: (payload: Record<string, unknown>) => payload.typ === "socket",
}));
vi.mock("@api/infra/auth/socket-ticket", () => ({
  consumeSocketTicket: async (jti: string) => {
    if (mocks.usedTickets.has(jti)) return false;
    mocks.usedTickets.add(jti);
    return true;
  },
}));
vi.mock("@api/infra/auth/blacklist", () => ({
  isBlacklisted: async (jti: string) => mocks.blacklisted.has(jti),
}));
vi.mock("@api/infra/auth/password-change", () => ({
  isTokenStale: async (sub: string) => mocks.stale.has(sub),
}));
vi.mock("@api/http/allowed-origins", () => ({ getAllowedAppOrigins: () => "*" }));
vi.mock("@api/infra/logger", () => ({ logger: mocks.log, createLogger: () => mocks.log }));
// Sem Redis neste teste: o adapter é coberto pelo teste de integração.
vi.mock("@api/infra/realtime/redis", () => ({
  isRealtimeRedisEnabled: () => false,
  getRealtimeChannelKey: () => "xua:test:socket.io",
  createRealtimeRedisConnection: () => {
    throw new Error("não deveria criar conexão Redis");
  },
}));

const { createSocketGateway, closeSocketGateway } = await import("@api/infra/socket/gateway");
const { realtimePublisher } = await import("@api/infra/realtime/publisher");

let httpServer: http.Server;
let io: Server;
let url: string;
const clients: ClientSocket[] = [];

function futureExp(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

function token(name: string, payload: Record<string, unknown>): string {
  mocks.tokens.set(name, { exp: futureExp(), iat: Math.floor(Date.now() / 1000), ...payload });
  return name;
}

/** Conecta e resolve com o socket já aceito, ou rejeita com o erro do handshake. */
function connect(authToken?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = connectClient(url, {
      transports: ["websocket"],
      reconnection: false,
      auth: authToken ? { token: authToken } : {},
    });
    clients.push(client);
    client.once("connect", () => resolve(client));
    client.once("connect_error", (err) => reject(err));
  });
}

function nextEvent<T>(client: ClientSocket, event: string, timeoutMs = 1000): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  httpServer = http.createServer();
  io = createSocketGateway(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await closeSocketGateway(io);
});

describe("socket gateway", () => {
  it("recusa conexão sem token", async () => {
    await expect(connect()).rejects.toThrow("UNAUTHORIZED");
  });

  it("recusa token inválido", async () => {
    await expect(connect("desconhecido")).rejects.toThrow("UNAUTHORIZED");
  });

  it("recusa token revogado no logout (blacklist)", async () => {
    mocks.blacklisted.add("jti-revogado");
    const t = token("revogado", { sub: "u-rev", role: "consumer", jti: "jti-revogado" });
    await expect(connect(t)).rejects.toThrow("UNAUTHORIZED");
  });

  it("recusa token anterior à troca de senha", async () => {
    mocks.stale.add("u-stale");
    const t = token("stale", { sub: "u-stale", role: "consumer", jti: "jti-stale" });
    await expect(connect(t)).rejects.toThrow("UNAUTHORIZED");
  });

  it("distributor_admin recebe eventos da própria distribuidora e não da outra", async () => {
    const a = await connect(token("adm-a", { sub: "adm-a", role: "distributor_admin", distributor_id: "dist-a" }));
    const b = await connect(token("adm-b", { sub: "adm-b", role: "distributor_admin", distributor_id: "dist-b" }));

    const gotA = nextEvent(a, "new_order");
    const gotB = nextEvent(b, "new_order", 300);
    realtimePublisher.publish("distributor:dist-a", "new_order", { orderId: "o1", status: "SENT_TO_DISTRIBUTOR" });

    await expect(gotA).resolves.toEqual({ orderId: "o1", status: "SENT_TO_DISTRIBUTOR" });
    await expect(gotB).resolves.toBe("timeout");
  });

  it("consumidor recebe só a própria sala", async () => {
    const c1 = await connect(token("c1", { sub: "c1", role: "consumer" }));
    const c2 = await connect(token("c2", { sub: "c2", role: "consumer" }));

    const got1 = nextEvent(c1, "order_status_changed");
    const got2 = nextEvent(c2, "order_status_changed", 300);
    realtimePublisher.publish("consumer:c1", "order_status_changed", { orderId: "o2", status: "DELIVERED" });

    await expect(got1).resolves.toMatchObject({ orderId: "o2" });
    await expect(got2).resolves.toBe("timeout");
  });

  it("ops e suporte entram na sala compartilhada", async () => {
    const ops = await connect(token("ops", { sub: "ops-1", role: "ops" }));
    const support = await connect(token("sup", { sub: "sup-1", role: "support" }));
    const consumer = await connect(token("c3", { sub: "c3", role: "consumer" }));

    const gotOps = nextEvent(ops, "otp_locked");
    const gotSupport = nextEvent(support, "otp_locked");
    const gotConsumer = nextEvent(consumer, "otp_locked", 300);
    realtimePublisher.publish("ops:broadcast", "otp_locked", {
      orderId: "o3",
      distributorId: "d",
      driverId: "dr",
      attempts: 5,
    });

    await expect(gotOps).resolves.toMatchObject({ orderId: "o3" });
    await expect(gotSupport).resolves.toMatchObject({ orderId: "o3" });
    await expect(gotConsumer).resolves.toBe("timeout");
  });

  it("evento emitido logo após conectar já chega (socket nasce dentro da sala)", async () => {
    const client = await connect(token("drv", { sub: "drv-1", role: "driver" }));
    const got = nextEvent(client, "new_delivery");
    realtimePublisher.publish("driver:drv-1", "new_delivery", { orderId: "o4", status: "OUT_FOR_DELIVERY" });
    await expect(got).resolves.toMatchObject({ orderId: "o4" });
  });

  it("desconecta quando o JWT expira", async () => {
    // 2 s de folga e ouvinte de "disconnect" registrado ANTES do connect:
    // com a máquina carregada (suíte inteira em paralelo) a desconexão podia
    // chegar antes de o teste começar a ouvir, e ele esperava para sempre.
    mocks.tokens.set("quase", { sub: "u-exp", role: "consumer", exp: Math.floor(Date.now() / 1000) + 2 });
    const client = connectClient(url, { transports: ["websocket"], reconnection: false, auth: { token: "quase" } });
    clients.push(client);
    const reason = await new Promise<string>((resolve) => client.once("disconnect", resolve));
    expect(reason).toBe("io server disconnect");
  }, 10_000);

  describe("passe curto do socket (site e API em domínios diferentes)", () => {
    const now = () => Math.floor(Date.now() / 1000);
    const ticket = (name: string, extra: Record<string, unknown> = {}) =>
      token(name, {
        sub: `u-${name}`,
        role: "consumer",
        jti: `jti-${name}`,
        typ: "socket",
        sid: `sess-${name}`,
        siat: now(),
        sexp: futureExp(),
        ...extra,
      });

    it("aceita o passe e põe o socket na sala do usuário", async () => {
      const client = await connect(ticket("ok"));
      const received = nextEvent(client, "order_status_changed");
      realtimePublisher.publish("consumer:u-ok", "order_status_changed", { orderId: "o1", status: "ACCEPTED_BY_DISTRIBUTOR" } as never);
      expect(await received).toMatchObject({ orderId: "o1" });
    });

    it("passe é de uso único: o segundo handshake com ele é recusado", async () => {
      const name = ticket("reuse");
      await connect(name);
      await expect(connect(name)).rejects.toThrow("UNAUTHORIZED");
    });

    it("passe de sessão encerrada (logout) é recusado", async () => {
      mocks.blacklisted.add("sess-logout");
      await expect(connect(ticket("logout"))).rejects.toThrow("UNAUTHORIZED");
    });

    it("a conexão vive até o fim da SESSÃO, não do passe de 60 s", async () => {
      // passe já vencido (o mock não confere exp), sessão válida por 1 h
      const client = await connect(ticket("long", { exp: now() - 10 }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(client.connected).toBe(true);
    });
  });
});
