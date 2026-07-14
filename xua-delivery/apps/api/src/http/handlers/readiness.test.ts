import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
  redis: { ping: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../infra/prisma/client", () => ({
  prisma: mocks.prisma,
}));

vi.mock("../../infra/redis/client", () => ({
  default: mocks.redis,
}));

vi.mock("../../infra/logger", () => ({
  logger: mocks.logger,
  createLogger: () => mocks.logger,
}));

const { readinessHandler } = await import("./readiness.js");

function createRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

const req = {} as Request;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readinessHandler", () => {
  it("responde 200 'ready' com banco e cache ok", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mocks.redis.ping.mockResolvedValue("PONG");
    const res = createRes();

    await readinessHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        checks: { server: "ok", database: "ok", cache_redis: "ok" },
      })
    );
  });

  it("cache Redis fora do ar é NÃO-crítico: 200 'degraded'", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mocks.redis.ping.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = createRes();

    await readinessHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        checks: { server: "ok", database: "ok", cache_redis: "error" },
      })
    );
  });

  it("banco fora do ar é CRÍTICO: 503 'not_ready'", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("db down"));
    mocks.redis.ping.mockResolvedValue("PONG");
    const res = createRes();

    await readinessHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "not_ready",
        checks: expect.objectContaining({ database: "error" }),
      })
    );
  });

  it("banco E cache fora do ar: 503 'not_ready' (banco domina)", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("db down"));
    mocks.redis.ping.mockRejectedValue(new Error("redis down"));
    const res = createRes();

    await readinessHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "not_ready",
        checks: { server: "ok", database: "error", cache_redis: "error" },
      })
    );
  });

  it("nunca lança mesmo com todas as dependências falhando", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("db down"));
    mocks.redis.ping.mockRejectedValue(new Error("redis down"));

    await expect(readinessHandler(req, createRes())).resolves.toBeUndefined();
  });
});
