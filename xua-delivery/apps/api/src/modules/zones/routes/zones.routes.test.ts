import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ZONE_ID = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const OWNER_DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236910";
const TARGET_DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236911";

const mocks = vi.hoisted(() => ({
  zonesService: {
    transfer: vi.fn(),
    listForOps: vi.fn(),
  },
  zonesRepository: {
    findDistributorId: vi.fn(),
  },
  distributorRepository: {
    resolveDistributorId: vi.fn(),
  },
}));

vi.mock("../../../middleware/auth.js", () => ({
  authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const role = req.header("x-test-role");

    if (!role) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    req.user = {
      sub: `user-${role}`,
      role: role as "consumer" | "distributor_admin" | "driver" | "ops" | "support",
      name: `User ${role}`,
      jti: `jti-${role}`,
      iat: 1,
      exp: 9_999_999_999,
    };

    next();
  },
}));

// rate-limit.js e limiter.js importam infra/redis/client.js, que exige
// REDIS_URL no carregamento do módulo — este teste de rota não deve depender
// de Redis real nem da env var, então ambos são mockados.
vi.mock("../../../middleware/rate-limit.js", () => ({
  rateLimitMiddleware:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));
vi.mock("../../../infra/rate-limit/limiter.js", () => ({
  RATE_LIMITS: { bulkImport: { windowSeconds: 60, maxRequests: 20 } },
}));

vi.mock("../services/zones.service.js", () => ({
  zonesService: mocks.zonesService,
}));
vi.mock("../repository/zones.repository.js", () => ({
  zonesRepository: mocks.zonesRepository,
}));
vi.mock("../../distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));
vi.mock("../../distributor/services/schedule.service.js", () => ({
  scheduleService: { getAvailableDates: vi.fn() },
}));
vi.mock("../../distributor/repository/timeslot.repository.js", () => ({
  timeslotRepository: { findActiveByDistributor: vi.fn() },
}));

const { zonesRoutes } = await import("./zones.routes.js");

let server: ReturnType<express.Application["listen"]>;
let baseUrl = "";

async function patchTransfer(
  role: string | null,
  body: Record<string, unknown> = { distributor_id: TARGET_DISTRIBUTOR_ID }
) {
  const response = await fetch(`${baseUrl}/api/zones/${ZONE_ID}/transfer`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/zones", zonesRoutes);

  server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.zonesService.transfer.mockResolvedValue({
    id: ZONE_ID,
    name: "JF — Centro",
    distributor_id: TARGET_DISTRIBUTOR_ID,
    is_active: true,
  });
  mocks.zonesService.listForOps.mockResolvedValue({
    zones: [],
    pagination: { limit: 20, offset: 0, total: 0 },
  });
});

/**
 * PATCH /:id/transfer é a única rota de escrita do módulo restrita a `ops` —
 * todas as outras aceitam `distributor_admin` também (com ownership check).
 * Essa assimetria só existe na declaração da rota (`requireRole("ops")`),
 * então precisa de um teste no nível de rota, não só de controller: um
 * refactor de `zones.routes.ts` que relaxe isso silenciosamente não quebraria
 * nenhum teste de controller isolado.
 */
describe("PATCH /api/zones/:id/transfer — restrito a ops", () => {
  it("nega distributor_admin, mesmo dono de outra zona qualquer", async () => {
    const response = await patchTransfer("distributor_admin");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Acesso negado" });
    expect(mocks.zonesService.transfer).not.toHaveBeenCalled();
    // Rota barra antes de qualquer resolução de ownership — nem chega a consultar.
    expect(mocks.distributorRepository.resolveDistributorId).not.toHaveBeenCalled();
  });

  it("nega consumer, driver e support", async () => {
    for (const role of ["consumer", "driver", "support"] as const) {
      const response = await patchTransfer(role);
      expect(response.status).toBe(403);
    }
    expect(mocks.zonesService.transfer).not.toHaveBeenCalled();
  });

  it("exige autenticação antes de checar role", async () => {
    const response = await patchTransfer(null);
    expect(response.status).toBe(401);
  });

  it("permite ops e delega para o service", async () => {
    const response = await patchTransfer("ops");

    expect(response.status).toBe(200);
    expect(mocks.zonesService.transfer).toHaveBeenCalledWith(
      ZONE_ID,
      TARGET_DISTRIBUTOR_ID,
      expect.objectContaining({ id: "user-ops" })
    );
  });
});

describe("GET /api/zones/all — distributor_admin nunca vê outra distribuidora", () => {
  it("ignora distributor_id injetado na query e usa o da própria distribuidora", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(OWNER_DISTRIBUTOR_ID);

    const response = await fetch(
      `${baseUrl}/api/zones/all?distributor_id=${TARGET_DISTRIBUTOR_ID}`,
      { headers: { "x-test-role": "distributor_admin" } }
    );

    expect(response.status).toBe(200);
    expect(mocks.zonesService.listForOps).toHaveBeenCalledWith(
      expect.objectContaining({ distributor_id: OWNER_DISTRIBUTOR_ID })
    );
  });
});
