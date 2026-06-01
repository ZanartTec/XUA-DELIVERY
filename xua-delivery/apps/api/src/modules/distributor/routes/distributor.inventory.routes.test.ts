import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockDistributorServiceError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "DistributorServiceError";
    }
  }

  class MockInventoryServiceError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "InventoryServiceError";
    }
  }

  class MockInventoryReconciliationSessionError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "InventoryReconciliationSessionError";
    }
  }

  return {
    DistributorServiceError: MockDistributorServiceError,
    InventoryServiceError: MockInventoryServiceError,
    InventoryReconciliationSessionError: MockInventoryReconciliationSessionError,
    distributorService: {
      listInventoryBalances: vi.fn(),
      listInventoryItems: vi.fn(),
      listInventoryMovements: vi.fn(),
      createInitialInventoryLoad: vi.fn(),
      openInventoryReconciliationSession: vi.fn(),
      listInventoryReconciliationSessions: vi.fn(),
      getInventoryReconciliationSession: vi.fn(),
      closeInventoryReconciliationSession: vi.fn(),
    },
    kpiService: { getKpis: vi.fn() },
    scheduleService: {
      getConfig: vi.fn(),
      upsertWeekdays: vi.fn(),
      blockDate: vi.fn(),
      unblockDate: vi.fn(),
    },
    scheduleRepository: {},
    timeslotRepository: {},
    distributorRepository: {
      findAvailableForZone: vi.fn(),
      findAllActive: vi.fn(),
    },
    routeService: { getRouteById: vi.fn() },
    loggerError: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock("../../../middleware/auth.js", () => ({
  authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const role = req.header("x-test-role");

    if (!role) {
      res.status(401).json({ error: "Nao autenticado" });
      return;
    }

    req.user = {
      sub: `user-${role}`,
      role,
      name: `User ${role}`,
      jti: `jti-${role}`,
      iat: 1,
      exp: 9_999_999_999,
      distributor_id:
        role === "distributor_admin"
          ? "7e1d7b55-3f52-4d10-aac3-74387c236802"
          : undefined,
    } as typeof req.user;

    next();
  },
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ error: mocks.loggerError, warn: mocks.loggerWarn }),
}));

vi.mock("../services/kpi.service.js", () => ({
  kpiService: mocks.kpiService,
}));



vi.mock("../services/schedule.service.js", () => ({
  scheduleService: mocks.scheduleService,
}));

vi.mock("../repository/schedule.repository.js", () => ({
  scheduleRepository: mocks.scheduleRepository,
}));

vi.mock("../repository/timeslot.repository.js", () => ({
  timeslotRepository: mocks.timeslotRepository,
}));

vi.mock("../repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

vi.mock("../services/route.service.js", () => ({
  routeService: mocks.routeService,
}));

vi.mock("../services/distributor.service.js", () => ({
  distributorService: mocks.distributorService,
  DistributorServiceError: mocks.DistributorServiceError,
}));

vi.mock("../../inventory/services/inventory.service.js", () => ({
  InventoryServiceError: mocks.InventoryServiceError,
}));

vi.mock("../../inventory/services/reconciliation-session.service.js", () => ({
  InventoryReconciliationSessionError: mocks.InventoryReconciliationSessionError,
}));

const { distributorRoutes } = await import("../index.js");

const itemId = "7e1d7b55-3f52-4d10-aac3-74387c236801";
const batchId = "7e1d7b55-3f52-4d10-aac3-74387c236802";
const sessionId = "7e1d7b55-3f52-4d10-aac3-74387c236803";

let server: ReturnType<express.Application["listen"]>;
let baseUrl = "";

async function request(path: string, role?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (role) {
    headers.set("x-test-role", role);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  return { status: response.status, body };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/distributor", distributorRoutes);

  server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

beforeEach(() => {
  vi.clearAllMocks();

  mocks.distributorService.listInventoryBalances.mockResolvedValue({
    balances: [],
    pagination: { limit: 20, offset: 0, total: 0 },
  });
  mocks.distributorService.listInventoryItems.mockResolvedValue({
    items: [],
    pagination: { limit: 100, offset: 0, total: 0 },
  });
  mocks.distributorService.listInventoryMovements.mockResolvedValue({
    movements: [],
    pagination: { limit: 20, offset: 0, total: 0 },
  });
  mocks.distributorService.createInitialInventoryLoad.mockResolvedValue({
    applied_count: 1,
    replayed_count: 0,
    skipped_count: 0,
    items: [],
  });
  mocks.distributorService.openInventoryReconciliationSession.mockResolvedValue({
    session: { id: sessionId, status: "OPEN" },
  });
  mocks.distributorService.listInventoryReconciliationSessions.mockResolvedValue({
    sessions: [{ id: sessionId, status: "OPEN" }],
    pagination: { limit: 20, offset: 0, total: 1 },
  });
  mocks.distributorService.getInventoryReconciliationSession.mockResolvedValue({
    session: { id: sessionId, status: "OPEN" },
  });
  mocks.distributorService.closeInventoryReconciliationSession.mockResolvedValue({
    session: { id: sessionId, status: "CLOSED" },
    adjusted_count: 0,
  });
});

describe("distributorRoutes inventory", () => {
  it("exige autenticacao nos endpoints de inventory", async () => {
    const response = await request("/api/distributor/inventory/balances?limit=20&offset=0");

    expect(response.status).toBe(401);
    expect(mocks.distributorService.listInventoryBalances).not.toHaveBeenCalled();
  });

  it("nega papeis que nao sao distributor_admin", async () => {
    const paths = [
      { method: "GET", path: "/api/distributor/inventory/balances?limit=20&offset=0" },
      { method: "GET", path: "/api/distributor/inventory/items?limit=100&offset=0" },
      { method: "GET", path: "/api/distributor/inventory/reconciliation-sessions?limit=20&offset=0" },
      {
        method: "POST",
        path: "/api/distributor/inventory/initial-load",
        body: { batch_id: batchId, items: [{ inventory_item_id: itemId, quantity: 1 }] },
      },
    ];

    for (const role of ["ops", "support", "consumer"] as const) {
      for (const path of paths) {
        const response = await request(path.path, role, {
          method: path.method,
          body: path.body ? JSON.stringify(path.body) : undefined,
        });

        expect(response.status).toBe(403);
      }
    }

    expect(mocks.distributorService.listInventoryBalances).not.toHaveBeenCalled();
    expect(mocks.distributorService.createInitialInventoryLoad).not.toHaveBeenCalled();
  });

  it("chama service com actor autenticado, sem distributor_id vindo do cliente", async () => {
    const response = await request(
      `/api/distributor/inventory/balances?inventory_item_id=${itemId}&limit=20&offset=0`,
      "distributor_admin"
    );

    expect(response.status).toBe(200);
    expect(mocks.distributorService.listInventoryBalances).toHaveBeenCalledWith({
      actorUserId: "user-distributor_admin",
      query: { inventory_item_id: itemId, limit: 20, offset: 0 },
    });
  });

  it("rejeita tentativas de informar distributor_id em query ou payload", async () => {
    const queryResponse = await request(
      `/api/distributor/inventory/balances?distributor_id=${batchId}&limit=20&offset=0`,
      "distributor_admin"
    );
    const bodyResponse = await request("/api/distributor/inventory/initial-load", "distributor_admin", {
      method: "POST",
      body: JSON.stringify({
        distributor_id: batchId,
        batch_id: batchId,
        items: [{ inventory_item_id: itemId, quantity: 1 }],
      }),
    });
    const openSessionResponse = await request(
      "/api/distributor/inventory/reconciliation-sessions",
      "distributor_admin",
      {
        method: "POST",
        body: JSON.stringify({ distributor_id: batchId }),
      }
    );

    expect(queryResponse.status).toBe(400);
    expect(bodyResponse.status).toBe(400);
    expect(openSessionResponse.status).toBe(400);
    expect(mocks.distributorService.listInventoryBalances).not.toHaveBeenCalled();
    expect(mocks.distributorService.createInitialInventoryLoad).not.toHaveBeenCalled();
    expect(mocks.distributorService.openInventoryReconciliationSession).not.toHaveBeenCalled();
  });

  it("mapeia falta de vinculo de distribuidora como 403", async () => {
    mocks.distributorService.listInventoryItems.mockRejectedValueOnce(
      new mocks.DistributorServiceError("DISTRIBUTOR_NOT_LINKED", "Usuario sem distribuidora")
    );

    const response = await request("/api/distributor/inventory/items?limit=100&offset=0", "distributor_admin");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Usuario sem distribuidora" });
  });
});
