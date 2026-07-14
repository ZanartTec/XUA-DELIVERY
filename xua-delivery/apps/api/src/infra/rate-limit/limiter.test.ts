import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  ensureConnected: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../redis/client", () => ({
  default: mocks.redis,
  ensureConnected: mocks.ensureConnected,
}));

vi.mock("../logger", () => ({
  logger: mocks.logger,
  createLogger: () => mocks.logger,
}));

const { checkRateLimit } = await import("./limiter.js");

const config = { windowSeconds: 60, maxRequests: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureConnected.mockResolvedValue(undefined);
  mocks.redis.expire.mockResolvedValue(1);
  mocks.redis.ttl.mockResolvedValue(42);
});

describe("checkRateLimit — fluxo normal", () => {
  it("permite a primeira requisição e define o TTL da janela", async () => {
    mocks.redis.incr.mockResolvedValue(1);

    const result = await checkRateLimit("auth:1.2.3.4", config);

    expect(result).toEqual({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
    expect(mocks.redis.incr).toHaveBeenCalledWith("rl:auth:1.2.3.4");
    expect(mocks.redis.expire).toHaveBeenCalledWith("rl:auth:1.2.3.4", 60);
  });

  it("não redefine o TTL em requisições subsequentes da mesma janela", async () => {
    mocks.redis.incr.mockResolvedValue(5);

    const result = await checkRateLimit("auth:1.2.3.4", config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
    expect(mocks.redis.expire).not.toHaveBeenCalled();
  });

  it("bloqueia acima do limite com retryAfterSeconds do TTL restante", async () => {
    mocks.redis.incr.mockResolvedValue(11);
    mocks.redis.ttl.mockResolvedValue(37);

    const result = await checkRateLimit("auth:1.2.3.4", config);

    expect(result).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 37 });
  });

  it("garante retryAfterSeconds mínimo de 1 quando o TTL é inválido", async () => {
    // ttl = -1 (chave sem expiração) ou -2 (chave inexistente)
    mocks.redis.incr.mockResolvedValue(11);
    mocks.redis.ttl.mockResolvedValue(-1);

    const result = await checkRateLimit("auth:1.2.3.4", config);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(1);
  });

  it("permite exatamente no limite (current === maxRequests)", async () => {
    mocks.redis.incr.mockResolvedValue(10);

    const result = await checkRateLimit("auth:1.2.3.4", config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(0);
  });
});

describe("checkRateLimit — fail-open com Redis indisponível", () => {
  it("permite o request quando a conexão falha (ensureConnected lança)", async () => {
    mocks.ensureConnected.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await checkRateLimit("auth:1.2.3.4", config);

    expect(result).toEqual({
      allowed: true,
      remaining: config.maxRequests,
      retryAfterSeconds: 0,
    });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it("permite o request quando um comando Redis falha (incr lança)", async () => {
    mocks.redis.incr.mockRejectedValue(new Error("Connection is closed."));

    const result = await checkRateLimit("payments:user-1", config);

    expect(result.allowed).toBe(true);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it("não propaga o erro para o chamador (nunca vira 500)", async () => {
    mocks.redis.incr.mockRejectedValue(new Error("boom"));

    await expect(checkRateLimit("auth:1.2.3.4", config)).resolves.toMatchObject({
      allowed: true,
    });
  });
});
