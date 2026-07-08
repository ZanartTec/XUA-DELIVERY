import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  service: {
    listDistributors: vi.fn(),
    listItems: vi.fn(),
    listBalances: vi.fn(),
    getBalance: vi.fn(),
    listMovements: vi.fn(),
    getMovement: vi.fn(),
  },
  reconciliationSessionService: {
    listSessionsForOps: vi.fn(),
    getSessionForOps: vi.fn(),
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

vi.mock("../controllers/audit.controller.js", () => ({
  auditController: { exportCsv: vi.fn() },
}));

vi.mock("../services/inventory-read.service.js", () => ({
  opsInventoryReadService: mocks.service,
}));

vi.mock("../../inventory/services/reconciliation-session.service.js", () => ({
  inventoryReconciliationSessionService: mocks.reconciliationSessionService,
}));

const { opsRoutes } = await import("../index.js");

const distributorA = "7e1d7b55-3f52-4d10-aac3-74387c236701";
const distributorB = "7e1d7b55-3f52-4d10-aac3-74387c236702";
const itemA = "7e1d7b55-3f52-4d10-aac3-74387c236703";
const itemB = "7e1d7b55-3f52-4d10-aac3-74387c236704";
const sessionId = "7e1d7b55-3f52-4d10-aac3-74387c236705";
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

  mocks.service.listDistributors.mockResolvedValue({
    distributors: [
      { id: distributorA, name: "XUA Centro" },
      { id: distributorB, name: "XUA Sul" },
    ],
  });

  mocks.service.listItems.mockResolvedValue({
    items: [
      {
        id: itemA,
        code: "WATER20L",
        name: "Agua 20L",
        type: "SELLABLE_PRODUCT",
        product_id: null,
        unit_label: "un",
        low_stock_threshold: 5,
        is_active: true,
        created_at: occurredAt,
        updated_at: occurredAt,
      },
    ],
    pagination: { limit: 100, offset: 0, total: 1 },
  });

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
  mocks.reconciliationSessionService.listSessionsForOps.mockResolvedValue({
    sessions: [
      {
        id: sessionId,
        distributor_id: distributorA,
        distributor_name: "XUA Centro",
        status: "OPEN",
        opened_by: "dist-admin-1",
        closed_by: null,
        justification: null,
        opened_at: occurredAt,
        closed_at: null,
        created_at: occurredAt,
        updated_at: occurredAt,
        item_count: 2,
      },
    ],
    pagination: { limit: 20, offset: 0, total: 1 },
  });
  mocks.reconciliationSessionService.getSessionForOps.mockResolvedValue({
    session: {
      id: sessionId,
      distributor_id: distributorA,
      distributor_name: "XUA Centro",
      status: "OPEN",
      opened_by: "dist-admin-1",
      closed_by: null,
      justification: null,
      opened_at: occurredAt,
      closed_at: null,
      created_at: occurredAt,
      updated_at: occurredAt,
      items: [],
    },
  });
});

describe("opsRoutes inventory", () => {
  it("exige autenticacao antes de expor filtros globais de inventory", async () => {
    const response = await fetch(`${baseUrl}/api/ops/inventory/distributors`);

    expect(response.status).toBe(401);
    expect(mocks.service.listDistributors).not.toHaveBeenCalled();
  });

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
    const sessions = await getJson<{
      sessions: Array<{ distributor_id: string }>;
    }>(
      "/api/ops/inventory/reconciliation-sessions?start=2026-05-26&end=2026-05-26&limit=20&offset=0",
      "ops"
    );

    expect(balances.status).toBe(200);
    expect(balances.body.balances).toHaveLength(2);
    expect(new Set(balances.body.balances.map((row: { distributor_id: string }) => row.distributor_id))).toEqual(
      new Set([distributorA, distributorB])
    );

    expect(movements.status).toBe(200);
    expect(movements.body.movements[0].distributor_id).toBe(distributorA);

    expect(sessions.status).toBe(200);
    expect(sessions.body.sessions[0].distributor_id).toBe(distributorA);
  });

  it("nega support e distributor_admin nos endpoints globais de inventory", async () => {
    const paths = [
      "/api/ops/inventory/distributors",
      "/api/ops/inventory/balances?limit=20&offset=0",
      "/api/ops/inventory/items?limit=100&offset=0",
      "/api/ops/inventory/movements?start=2026-05-26&end=2026-05-26&limit=20&offset=0",
      "/api/ops/inventory/reconciliation-sessions?limit=20&offset=0",
    ];

    for (const role of ["support", "distributor_admin"] as const) {
      for (const path of paths) {
        const response = await getJson<{ error: string }>(path, role);
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "Acesso negado" });
      }
    }
  });

  it("nao monta mais o endpoint legado de conciliacao diaria", async () => {
    const response = await fetch(`${baseUrl}/api/ops/reconciliations`, {
      headers: { "x-test-role": "distributor_admin" },
    });

    expect(response.status).toBe(404);
  });

  it("nao expõe mais a leitura legacy da tabela de reconciliacoes no OPS inventory", async () => {
    const listResponse = await fetch(
      `${baseUrl}/api/ops/inventory/reconciliations?start=2026-05-01&end=2026-05-31&limit=5&offset=0`,
      {
        headers: { "x-test-role": "ops" },
      }
    );
    const detailResponse = await fetch(`${baseUrl}/api/ops/inventory/reconciliations/legacy-id`, {
      headers: { "x-test-role": "ops" },
    });

    expect(listResponse.status).toBe(404);
    expect(detailResponse.status).toBe(404);
  });

  it("lista distribuidoras ativas para filtros OPS sem depender de saldos", async () => {
    const response = await getJson<{ distributors: Array<{ id: string; name: string }> }>(
      "/api/ops/inventory/distributors",
      "ops"
    );

    expect(response.status).toBe(200);
    expect(mocks.service.listDistributors).toHaveBeenCalledWith();
    expect(response.body.distributors).toEqual([
      { id: distributorA, name: "XUA Centro" },
      { id: distributorB, name: "XUA Sul" },
    ]);
  });

  it("lista itens de inventory para filtros OPS", async () => {
    const response = await getJson<{ items: Array<{ id: string; code: string }> }>(
      "/api/ops/inventory/items?is_active=true&limit=100&offset=0",
      "ops"
    );

    expect(response.status).toBe(200);
    expect(mocks.service.listItems).toHaveBeenCalledWith({
      is_active: true,
      limit: 100,
      offset: 0,
    });
    expect(response.body.items[0]).toMatchObject({ id: itemA, code: "WATER20L" });
  });

  it("mantem OPS inventory read-only sem rotas de escrita de itens", async () => {
    const postResponse = await fetch(`${baseUrl}/api/ops/inventory/items`, {
      method: "POST",
      headers: { "x-test-role": "ops", "content-type": "application/json" },
      body: JSON.stringify({ code: "NEW", name: "Novo", type: "SELLABLE_PRODUCT" }),
    });
    const patchResponse = await fetch(`${baseUrl}/api/ops/inventory/items/${itemA}`, {
      method: "PATCH",
      headers: { "x-test-role": "ops", "content-type": "application/json" },
      body: JSON.stringify({ name: "Alterado" }),
    });

    expect(postResponse.status).toBe(404);
    expect(patchResponse.status).toBe(404);
    expect(mocks.service.listItems).not.toHaveBeenCalled();
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
      is_active: true,
      limit: 10,
      offset: 5,
    });
  });

  it("oculta itens inativos por padrao e permite is_active explicito nos saldos OPS", async () => {
    const defaultResponse = await getJson<Record<string, unknown>>(
      "/api/ops/inventory/balances?limit=20&offset=0",
      "ops"
    );

    expect(defaultResponse.status).toBe(200);
    expect(mocks.service.listBalances).toHaveBeenLastCalledWith(
      expect.objectContaining({ is_active: true })
    );

    const inactiveResponse = await getJson<Record<string, unknown>>(
      "/api/ops/inventory/balances?is_active=false&limit=20&offset=0",
      "ops"
    );

    expect(inactiveResponse.status).toBe(200);
    expect(mocks.service.listBalances).toHaveBeenLastCalledWith(
      expect.objectContaining({ is_active: false })
    );

    const explicitResponse = await getJson<Record<string, unknown>>(
      "/api/ops/inventory/balances?is_active=true&limit=20&offset=0",
      "ops"
    );

    expect(explicitResponse.status).toBe(200);
    expect(mocks.service.listBalances).toHaveBeenLastCalledWith(
      expect.objectContaining({ is_active: true })
    );

    const invalidResponse = await getJson<{ error: string }>(
      "/api/ops/inventory/balances?is_active=maybe&limit=20&offset=0",
      "ops"
    );

    expect(invalidResponse.status).toBe(400);
    expect(mocks.service.listBalances).toHaveBeenCalledTimes(3);
  });

  it("rejeita query invalida antes de chamar service OPS", async () => {
    const response = await getJson<{ error: string }>(
      "/api/ops/inventory/balances?limit=9999&offset=0",
      "ops"
    );

    expect(response.status).toBe(400);
    expect(mocks.service.listBalances).not.toHaveBeenCalled();
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

  it("lista e detalha sessoes fisicas de conciliacao para OPS", async () => {
    const listResponse = await getJson<{
      sessions: Array<{ id: string; distributor_id: string; distributor_name: string }>;
    }>(
      `/api/ops/inventory/reconciliation-sessions?distributor_id=${distributorA}&status=OPEN&start=2026-05-01&end=2026-05-31&limit=20&offset=0`,
      "ops"
    );
    const detailResponse = await getJson<{
      session: { id: string; distributor_id: string; distributor_name: string };
    }>(`/api/ops/inventory/reconciliation-sessions/${sessionId}`, "ops");

    expect(listResponse.status).toBe(200);
    expect(mocks.reconciliationSessionService.listSessionsForOps).toHaveBeenCalledWith({
      distributor_id: distributorA,
      status: "OPEN",
      start: "2026-05-01",
      end: "2026-05-31",
      limit: 20,
      offset: 0,
    });
    expect(listResponse.body.sessions[0]).toMatchObject({
      id: sessionId,
      distributor_id: distributorA,
      distributor_name: "XUA Centro",
    });

    expect(detailResponse.status).toBe(200);
    expect(mocks.reconciliationSessionService.getSessionForOps).toHaveBeenCalledWith(sessionId);
    expect(detailResponse.body.session).toMatchObject({
      id: sessionId,
      distributor_id: distributorA,
      distributor_name: "XUA Centro",
    });
  });
});