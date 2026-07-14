import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
}));

const ENV_KEYS = [
  "REDIS_URL",
  "CACHE_REDIS_URL",
  "QUEUE_REDIS_URL",
  "REDIS_KEY_PREFIX",
] as const;

const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * Importa o módulo de config sempre "fresco" — REDIS_KEY_PREFIX é resolvido
 * no load do módulo e o log de boot é deduplicado por finalidade.
 */
async function loadConfig() {
  vi.resetModules();
  return import("./config.js");
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
});

afterEach(() => {
  restoreEnv();
});

describe("getRedisUrl", () => {
  it("prefere CACHE_REDIS_URL para finalidade cache", async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-host:6380";
    process.env.REDIS_URL = "redis://legacy-host:6379";

    const { getRedisUrl } = await loadConfig();

    expect(getRedisUrl("cache")).toBe("redis://cache-host:6380");
  });

  it("cai para REDIS_URL quando CACHE_REDIS_URL não está definida", async () => {
    process.env.REDIS_URL = "redis://legacy-host:6379";

    const { getRedisUrl } = await loadConfig();

    expect(getRedisUrl("cache")).toBe("redis://legacy-host:6379");
  });

  it("lança erro claro quando nem CACHE_REDIS_URL nem REDIS_URL existem", async () => {
    const { getRedisUrl } = await loadConfig();

    expect(() => getRedisUrl("cache")).toThrowError(
      /CACHE_REDIS_URL ou REDIS_URL não definido/
    );
  });

  it("prefere QUEUE_REDIS_URL para finalidade queue", async () => {
    process.env.QUEUE_REDIS_URL = "redis://queue-host:6381";
    process.env.REDIS_URL = "redis://legacy-host:6379";

    const { getRedisUrl } = await loadConfig();

    expect(getRedisUrl("queue")).toBe("redis://queue-host:6381");
  });

  it("cai para REDIS_URL quando QUEUE_REDIS_URL não está definida", async () => {
    process.env.REDIS_URL = "redis://legacy-host:6379";

    const { getRedisUrl } = await loadConfig();

    expect(getRedisUrl("queue")).toBe("redis://legacy-host:6379");
  });

  it("lança erro claro quando nem QUEUE_REDIS_URL nem REDIS_URL existem", async () => {
    const { getRedisUrl } = await loadConfig();

    expect(() => getRedisUrl("queue")).toThrowError(
      /QUEUE_REDIS_URL ou REDIS_URL não definido/
    );
  });

  it("finalidade default usa apenas REDIS_URL, ignorando as dedicadas", async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-host:6380";
    process.env.QUEUE_REDIS_URL = "redis://queue-host:6381";
    process.env.REDIS_URL = "redis://legacy-host:6379";

    const { getRedisUrl } = await loadConfig();

    expect(getRedisUrl()).toBe("redis://legacy-host:6379");
  });

  it("finalidade default lança erro claro sem REDIS_URL", async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-host:6380";

    const { getRedisUrl } = await loadConfig();

    expect(() => getRedisUrl()).toThrowError(/REDIS_URL não definido/);
  });
});

describe("log de boot", () => {
  it("NUNCA vaza credenciais da URL no log (apenas host:port)", async () => {
    process.env.CACHE_REDIS_URL = "redis://xua-user:s3cr3t-p4ss@cache-host:6390";

    const { getRedisUrl } = await loadConfig();
    getRedisUrl("cache");

    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(loggerMock.info.mock.calls[0]);
    expect(serialized).not.toContain("s3cr3t-p4ss");
    expect(serialized).not.toContain("xua-user");
    expect(loggerMock.info.mock.calls[0]?.[0]).toMatchObject({
      purpose: "cache",
      envVar: "CACHE_REDIS_URL",
      fallback: false,
      host: "cache-host:6390",
    });
  });

  it("usa porta default 6379 quando a URL não define porta", async () => {
    process.env.QUEUE_REDIS_URL = "redis://queue-host";

    const { getRedisUrl } = await loadConfig();
    getRedisUrl("queue");

    expect(loggerMock.info.mock.calls[0]?.[0]).toMatchObject({
      host: "queue-host:6379",
    });
  });

  it("marca fallback:true quando resolve via REDIS_URL", async () => {
    process.env.REDIS_URL = "redis://legacy-host:6379";

    const { getRedisUrl } = await loadConfig();
    getRedisUrl("queue");

    expect(loggerMock.info.mock.calls[0]?.[0]).toMatchObject({
      purpose: "queue",
      envVar: "REDIS_URL",
      fallback: true,
    });
  });

  it("loga apenas uma vez por finalidade (dedup entre chamadas)", async () => {
    process.env.CACHE_REDIS_URL = "redis://cache-host:6380";
    process.env.QUEUE_REDIS_URL = "redis://queue-host:6381";

    const { getRedisUrl } = await loadConfig();
    getRedisUrl("cache");
    getRedisUrl("cache");
    getRedisUrl("queue");
    getRedisUrl("queue");

    expect(loggerMock.info).toHaveBeenCalledTimes(2);
  });
});

describe("buildRedisKey", () => {
  it("monta a chave com o prefixo de REDIS_KEY_PREFIX", async () => {
    process.env.REDIS_KEY_PREFIX = "xua:test";

    const { buildRedisKey } = await loadConfig();

    expect(buildRedisKey("cache", "products")).toBe("xua:test:cache:products");
  });

  it("é estável entre chamadas com os mesmos argumentos", async () => {
    process.env.REDIS_KEY_PREFIX = "xua:test";

    const { buildRedisKey } = await loadConfig();

    expect(buildRedisKey("otp", "abc-123")).toBe(buildRedisKey("otp", "abc-123"));
  });

  it("usa o prefixo default baseado em NODE_ENV quando REDIS_KEY_PREFIX não existe", async () => {
    const { buildRedisKey } = await loadConfig();

    const env = process.env.NODE_ENV ?? "development";
    expect(buildRedisKey("cache", "banners")).toBe(`xua:${env}:cache:banners`);
  });
});
