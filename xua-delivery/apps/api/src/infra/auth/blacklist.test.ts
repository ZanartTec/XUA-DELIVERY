import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
  },
  ensureConnected: vi.fn(),
}));

vi.mock("../redis/client", () => ({
  default: mocks.redis,
  ensureConnected: mocks.ensureConnected,
}));

const { blacklistToken, isBlacklisted } = await import("./blacklist.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("blacklistToken", () => {
  it("garante a conexão com Redis antes de gravar", async () => {
    await blacklistToken("jti-1", Math.floor(Date.now() / 1000) + 120);
    expect(mocks.ensureConnected).toHaveBeenCalled();
  });

  it("grava com TTL igual ao tempo restante até a expiração", async () => {
    const now = Math.floor(Date.now() / 1000);
    await blacklistToken("jti-1", now + 120);

    expect(mocks.redis.set).toHaveBeenCalledWith("jwt:bl:jti-1", "1", "EX", expect.any(Number));
    const ttl = mocks.redis.set.mock.calls[0][3];
    expect(ttl).toBeGreaterThan(110);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it("usa TTL mínimo de 1s para token cuja expiração já passou", async () => {
    const past = Math.floor(Date.now() / 1000) - 500;
    await blacklistToken("jti-2", past);
    expect(mocks.redis.set).toHaveBeenCalledWith("jwt:bl:jti-2", "1", "EX", 1);
  });
});

describe("isBlacklisted", () => {
  it("retorna true quando o jti está no blacklist", async () => {
    mocks.redis.get.mockResolvedValue("1");
    await expect(isBlacklisted("jti-1")).resolves.toBe(true);
    expect(mocks.redis.get).toHaveBeenCalledWith("jwt:bl:jti-1");
  });

  it("retorna false quando o jti não está no blacklist", async () => {
    mocks.redis.get.mockResolvedValue(null);
    await expect(isBlacklisted("jti-1")).resolves.toBe(false);
  });
});
