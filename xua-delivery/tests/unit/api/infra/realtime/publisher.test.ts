import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  emitterTo: vi.fn(),
  emitterEmit: vi.fn(),
  EmitterCtor: vi.fn(),
  quit: vi.fn(),
  enabled: true,
}));

vi.mock("@api/infra/logger/index.js", () => ({ createLogger: () => mocks.log, logger: mocks.log }));
vi.mock("@api/infra/logger", () => ({ createLogger: () => mocks.log, logger: mocks.log }));

vi.mock("@api/infra/realtime/redis", () => ({
  createRealtimeRedisConnection: () => ({ quit: mocks.quit }),
  getRealtimeChannelKey: () => "xua:test:socket.io",
  isRealtimeRedisEnabled: () => mocks.enabled,
}));

vi.mock("@socket.io/redis-emitter", () => ({
  Emitter: class {
    constructor(...args: unknown[]) {
      mocks.EmitterCtor(...args);
    }
    to(room: string) {
      mocks.emitterTo(room);
      return { emit: mocks.emitterEmit };
    }
  },
}));

const publisherModule = await import("@api/infra/realtime/publisher");
const { attachRealtimeServer, closeRealtime, getRealtimeMode, initRealtimeEmitter, realtimePublisher } =
  publisherModule;

const payload = { orderId: "o1", status: "SENT_TO_DISTRIBUTOR" as const };

beforeEach(async () => {
  await closeRealtime();
  vi.clearAllMocks();
  mocks.enabled = true;
});

describe("realtimePublisher", () => {
  it("sem inicialização registra erro e não lança (evento não some em silêncio)", () => {
    expect(() => realtimePublisher.publish("distributor:d1", "new_order", payload)).not.toThrow();
    expect(mocks.log.error).toHaveBeenCalledWith(
      { room: "distributor:d1", event: "new_order" },
      expect.stringContaining("not initialized")
    );
  });

  it("modo servidor emite pelo Socket.IO na sala pedida", () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    attachRealtimeServer({ to });

    realtimePublisher.publish("distributor:d1", "new_order", payload);

    expect(getRealtimeMode()).toBe("server");
    expect(to).toHaveBeenCalledWith("distributor:d1");
    expect(emit).toHaveBeenCalledWith("new_order", payload);
  });

  it("modo emitter (worker) publica no canal Redis com a chave compartilhada", async () => {
    await initRealtimeEmitter();
    realtimePublisher.publish("consumer:c1", "order_status_changed", { orderId: "o1", status: "CANCELLED" });

    expect(getRealtimeMode()).toBe("emitter");
    expect(mocks.EmitterCtor).toHaveBeenCalledWith(expect.anything(), { key: "xua:test:socket.io" });
    expect(mocks.emitterTo).toHaveBeenCalledWith("consumer:c1");
    expect(mocks.emitterEmit).toHaveBeenCalledWith("order_status_changed", { orderId: "o1", status: "CANCELLED" });
  });

  it("com REALTIME_REDIS_ADAPTER=off o worker fica desligado sem logar erro a cada evento", async () => {
    mocks.enabled = false;
    await initRealtimeEmitter();
    realtimePublisher.publish("consumer:c1", "new_order", payload);

    expect(getRealtimeMode()).toBe("disabled");
    expect(mocks.EmitterCtor).not.toHaveBeenCalled();
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  it("falha do transporte vira warn e não propaga para quem já comitou", () => {
    attachRealtimeServer({
      to: () => {
        throw new Error("boom");
      },
    });

    expect(() => realtimePublisher.publish("driver:x", "new_delivery", payload)).not.toThrow();
    expect(mocks.log.warn).toHaveBeenCalled();
  });

  it("closeRealtime fecha a conexão do emitter", async () => {
    await initRealtimeEmitter();
    await closeRealtime();
    expect(mocks.quit).toHaveBeenCalled();
    expect(getRealtimeMode()).toBeNull();
  });
});
