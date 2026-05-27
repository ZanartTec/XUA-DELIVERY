import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  service: {
    listBalances: vi.fn(),
    getBalance: vi.fn(),
    listMovements: vi.fn(),
    getMovement: vi.fn(),
    listReconciliations: vi.fn(),
    getReconciliation: vi.fn(),
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
      role: role as "ops" | "support" | "distributor_admin",
      name: `User ${role}`,
      jti: `jti-${role}`,
      iat: 1,
      exp: 9_999_999_999,
      distributor_id:
        role === "distributor_admin"
          ? "7e1d7b55-3f52-4d10-aac3-74387c236702"
          : undefined,
    };

    next();
  },
}));

vi.mock("../controllers/kpi.controller.js", () => ({
  kpiController: { get: vi.fn() },
}));

vi.mock("../controllers/reconciliation.controller.js", () => ({
  reconciliationController: { get: vi.fn(), close: vi.fn() },
}));

vi.mock("../controllers/audit.controller.js", () => ({
  auditController: { exportCsv: vi.fn() },
}));

vi.mock("../services/inventory-read.service.js", () => ({
  opsInventoryReadService: mocks.service,
}));

const { opsRoutes } = await import("../index.js");

const distributorA = "7e1d7b55-3f52-4d10-aac3-74387c236701";
const distributorB = "7e1d7b55-3f52-4d10-aac3-74387c236702";
const itemA = "7e1d7b55-3f52-4d10-aac3-74387c236703";
const itemB = "7e1d7b55-3f52-4d10-aac3-74387c236704";
const occurredAt = new Date("2026-05-26T10:30:00.000Z").toISOString();

let server: ReturnType<express.Application["listen"]>;
let baseUrl = "";

async function getJson<T>(path: string, role: "ops" | "support" | "distributor_admin") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-role": role },
  });

  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/ops", opsRoutes);

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

  mocks.service.listBalances.mockResolvedValue({
    balances: [
      {
        id: "balance-a",
        distributor_id: distributorA,
        distributor_name: "XUA Centro",
        inventory_item_id: itemA,
        item: {
          id: itemA,
          code: "WATER20L",
          name: "Agua 20L",
          type: "SELLABLE_PRODUCT",
          unit_label: "un",
        },
        quantity_on_hand: 12,
        low_stock_threshold: 5,
        is_low_stock: false,
        last_movement_at: occurredAt,
        updated_at: occurredAt,
      },
      {
        id: "balance-b",
        distributor_id: distributorB,
        distributor_name: "XUA Sul",
        inventory_item_id: itemB,
        item: {
          id: itemB,
          code: "EMPTY20L",
          name: "Garrafao vazio 20L",
          type: "RETURNABLE_EMPTY",
          unit_label: "un",
        },
        quantity_on_hand: 3,
        low_stock_threshold: 5,
        is_low_stock: true,
        last_movement_at: occurredAt,
        updated_at: occurredAt,
      },
    ],
    pagination: { limit: 20, offset: 0, total: 2 },
  });

  mocks.service.listMovements.mockResolvedValue({
    movements: [
      {
        id: "movement-a",
        distributor_id: distributorA,
        distributor_name: "XUA Centro",
        inventory_item_id: itemA,
        item: {
          id: itemA,
          code: "WATER20L",
          name: "Agua 20L",
          type: "SELLABLE_PRODUCT",
          unit_label: "un",
        },
        quantity_delta: 4,
        movement_type: "INITIAL_LOAD",
        actor_type: "OPS",
        actor_id: "ops-user-1",
        source_app: "OPS_CONSOLE",
        reference_type: "INITIAL_LOAD",
        reference_id: "batch-a",
        metadata: {
          origin: "distributor_initial_load_endpoint",
          batch_id: "7e1d7b55-3f52-4d10-aac3-74387c236799",
          batch_hash: "hash-a",
          batch_version: "v1",
        },
        occurred_at: occurredAt,
      },
    ],
    pagination: { limit: 20, offset: 0, total: 1 },
  });

  mocks.service.listReconciliations.mockResolvedValue({
    reconciliations: [
      {
        id: "reconciliation-a",
        distributor_id: distributorA,
        distributor_name: "XUA Centro",
        reconciliation_date: "2026-05-26T00:00:00.000Z",
        full_out: 12,
        empty_returned: 10,
        delta: 2,
        justification: "Ajuste operacional",
        closed_by: "dist-admin-1",
        created_at: occurredAt,
      },
    ],
    pagination: { limit: 20, offset: 0, total: 1 },
  });
});

describe("opsRoutes inventory", () => {
  it("permite OPS nas listagens globais e retorna multiplas distribuidoras", async () => {
    const balances = await getJson<{
      balances: Array<{ distributor_id: string }>;
    }>("/api/ops/inventory/balances?limit=20&offset=0", "ops");
    const movements = await getJson<{
      movements: Array<{ distributor_id: string }>;
    }>(
      "/api/ops/inventory/movements?start=2026-05-26&end=2026-05-26&limit=20&offset=0",
      "ops"
    );
    const reconciliations = await getJson<{
      reconciliations: Array<{ distributor_id: string }>;
    }>(
      "/api/ops/inventory/reconciliations?start=2026-05-26&end=2026-05-26&limit=20&offset=0",
      "ops"
    );

    expect(balances.status).toBe(200);
    expect(balances.body.balances).toHaveLength(2);
    expect(new Set(balances.body.balances.map((row: { distributor_id: string }) => row.distributor_id))).toEqual(
      new Set([distributorA, distributorB])
    );

    expect(movements.status).toBe(200);
    expect(movements.body.movements[0].distributor_id).toBe(distributorA);

    expect(reconciliations.status).toBe(200);
    expect(reconciliations.body.reconciliations[0].distributor_id).toBe(distributorA);
  });

  it("nega support e distributor_admin nos endpoints globais de inventory", async () => {
    const paths = [
      "/api/ops/inventory/balances?limit=20&offset=0",
      "/api/ops/inventory/movements?start=2026-05-26&end=2026-05-26&limit=20&offset=0",
      "/api/ops/inventory/reconciliations?start=2026-05-26&end=2026-05-26&limit=20&offset=0",
    ];

    for (const role of ["support", "distributor_admin"] as const) {
      for (const path of paths) {
        const response = await getJson<{ error: string }>(path, role);
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "Acesso negado" });
      }
    }
  });

  it("encaminha filtros de distribuidora e item no endpoint de saldos", async () => {
    const response = await getJson<Record<string, unknown>>(
      `/api/ops/inventory/balances?distributor_id=${distributorA}&inventory_item_id=${itemA}&limit=10&offset=5`,
      "ops"
    );

    expect(response.status).toBe(200);
    expect(mocks.service.listBalances).toHaveBeenCalledWith({
      distributor_id: distributorA,
      inventory_item_id: itemA,
      limit: 10,
      offset: 5,
    });
  });

  it("encaminha filtros de distribuidora, item e periodo no endpoint de movimentos", async () => {
    const response = await getJson<Record<string, unknown>>(
      `/api/ops/inventory/movements?distributor_id=${distributorB}&inventory_item_id=${itemB}&movement_type=INITIAL_LOAD&start=2026-05-01&end=2026-05-15&limit=15&offset=30`,
      "ops"
    );

    expect(response.status).toBe(200);
    expect(mocks.service.listMovements).toHaveBeenCalledWith({
      distributor_id: distributorB,
      inventory_item_id: itemB,
      movement_type: "INITIAL_LOAD",
      start: "2026-05-01",
      end: "2026-05-15",
      limit: 15,
      offset: 30,
    });
  });

  it("aplica filtro de distribuidora e periodo no endpoint de reconciliacoes", async () => {
    const response = await getJson<Record<string, unknown>>(
      `/api/ops/inventory/reconciliations?distributor_id=${distributorA}&start=2026-05-01&end=2026-05-31&limit=5&offset=0`,
      "ops"
    );

    expect(response.status).toBe(200);
    expect(mocks.service.listReconciliations).toHaveBeenCalledWith({
      distributor_id: distributorA,
      start: "2026-05-01",
      end: "2026-05-31",
      limit: 5,
      offset: 0,
    });
  });
});