import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./client", () => ({
  default: mocks.redis,
}));

vi.mock("../logger", () => ({
  logger: mocks.logger,
  createLogger: () => mocks.logger,
}));

const { getCacheJson, setCacheJson, deleteCacheKey } = await import("./cache.js");
const { buildRedisKey } = await import("./config.js");

const key = "products:dist-1";
const redisKey = buildRedisKey("cache", key);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCacheJson", () => {
  it("retorna o valor parseado em cache hit", async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify({ items: [1, 2] }));

    await expect(getCacheJson(key)).resolves.toEqual({ items: [1, 2] });
    expect(mocks.redis.get).toHaveBeenCalledWith(redisKey);
  });

  it("retorna null em cache miss", async () => {
    mocks.redis.get.mockResolvedValue(null);

    await expect(getCacheJson(key)).resolves.toBeNull();
  });

  it("best-effort: retorna null (sem propagar) quando o Redis falha", async () => {
    mocks.redis.get.mockRejectedValue(new Error("Connection is closed."));

    await expect(getCacheJson(key)).resolves.toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it("best-effort: retorna null quando o payload em cache é JSON inválido", async () => {
    mocks.redis.get.mockResolvedValue("{corrompido");

    await expect(getCacheJson(key)).resolves.toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("setCacheJson", () => {
  it("grava JSON serializado com TTL", async () => {
    mocks.redis.set.mockResolvedValue("OK");

    await setCacheJson(key, { a: 1 }, 300);

    expect(mocks.redis.set).toHaveBeenCalledWith(
      redisKey,
      JSON.stringify({ a: 1 }),
      "EX",
      300
    );
  });

  it("best-effort: não propaga erro de escrita", async () => {
    mocks.redis.set.mockRejectedValue(new Error("READONLY"));

    await expect(setCacheJson(key, { a: 1 }, 300)).resolves.toBeUndefined();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("deleteCacheKey", () => {
  it("remove a chave com o prefixo correto", async () => {
    mocks.redis.del.mockResolvedValue(1);

    await deleteCacheKey(key);

    expect(mocks.redis.del).toHaveBeenCalledWith(redisKey);
  });

  it("best-effort: não propaga erro de invalidação", async () => {
    mocks.redis.del.mockRejectedValue(new Error("Connection is closed."));

    await expect(deleteCacheKey(key)).resolves.toBeUndefined();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });
});
