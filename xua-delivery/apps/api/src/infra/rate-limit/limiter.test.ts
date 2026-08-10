import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  ensureConnected: vi.fn(),
}));

vi.mock("../redis/client", () => ({
  default: mocks.redis,
  ensureConnected: mocks.ensureConnected,
}));

const { checkRateLimit, RATE_LIMITS } = await import("./limiter.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("permite requisições até o limite configurado", async () => {
    mocks.redis.incr.mockResolvedValue(1);
    mocks.redis.ttl.mockResolvedValue(60);

    const result = await checkRateLimit("user-1", { windowSeconds: 60, maxRequests: 10 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.retryAfterSeconds).toBe(0);
    expect(mocks.redis.expire).toHaveBeenCalledWith("rl:user-1", 60);
  });

  it("só chama expire() na primeira requisição da janela", async () => {
    mocks.redis.incr.mockResolvedValue(5);
    mocks.redis.ttl.mockResolvedValue(30);

    await checkRateLimit("user-1", { windowSeconds: 60, maxRequests: 10 });

    expect(mocks.redis.expire).not.toHaveBeenCalled();
  });

  it("bloqueia quando o contador ultrapassa maxRequests", async () => {
    mocks.redis.incr.mockResolvedValue(11);
    mocks.redis.ttl.mockResolvedValue(15);

    const result = await checkRateLimit("user-1", { windowSeconds: 60, maxRequests: 10 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(15);
  });

  it("retryAfterSeconds nunca fica abaixo de 1 quando bloqueado", async () => {
    mocks.redis.incr.mockResolvedValue(11);
    mocks.redis.ttl.mockResolvedValue(0);

    const result = await checkRateLimit("user-1", { windowSeconds: 60, maxRequests: 10 });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(1);
  });

  it("garante a conexão com Redis antes de contar", async () => {
    mocks.redis.incr.mockResolvedValue(1);
    mocks.redis.ttl.mockResolvedValue(60);

    await checkRateLimit("user-1", { windowSeconds: 60, maxRequests: 10 });

    expect(mocks.ensureConnected).toHaveBeenCalled();
  });
});

describe("RATE_LIMITS", () => {
  it("categorias padrão têm janela e limite positivos", () => {
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
      expect(config.windowSeconds, `${name}.windowSeconds`).toBeGreaterThan(0);
      expect(config.maxRequests, `${name}.maxRequests`).toBeGreaterThan(0);
    }
  });
});
