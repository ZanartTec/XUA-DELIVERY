import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const ZONE_ID = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const OWNER_DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236910";
const OTHER_DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236911";
const USER_ID = "7e1d7b55-3f52-4d10-aac3-74387c236999";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  zonesService: {
    list: vi.fn(),
    listForOps: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    transfer: vi.fn(),
    addCoverage: vi.fn(),
    addCoverageBulk: vi.fn(),
    previewConflicts: vi.fn(),
    removeCoverage: vi.fn(),
  },
  zonesRepository: { findDistributorId: vi.fn() },
  distributorRepository: {
    resolveDistributorId: vi.fn(),
    resolveCoveredZone: vi.fn(),
  },
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), error: mocks.logError }),
}));
vi.mock("../services/zones.service.js", async () => {
  const actual = await vi.importActual<typeof import("../services/zones.service.js")>(
    "../services/zones.service.js"
  );
  return { zonesService: mocks.zonesService, ZoneServiceError: actual.ZoneServiceError };
});
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

const { zonesController } = await import("./zones.controller.js");
const { ZoneServiceError } = await import("../services/zones.service.js");

function req(
  role: string,
  {
    body = {},
    query = {},
    params = { id: ZONE_ID },
  }: {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {}
): Request {
  return { user: { sub: USER_ID, role }, params, query, body } as unknown as Request;
}

function res() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  response.status.mockReturnValue(response);
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.zonesRepository.findDistributorId.mockResolvedValue(OWNER_DISTRIBUTOR_ID);
  mocks.zonesService.update.mockResolvedValue({ zone: {}, affected_addresses: 0 });
  mocks.zonesService.create.mockResolvedValue({ id: ZONE_ID });
});

describe("ownership nas rotas de escrita", () => {
  it("blocks a distributor_admin from editing a zone of another distributor", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(OTHER_DISTRIBUTOR_ID);
    const r = res();

    await zonesController.update(req("distributor_admin", { body: { name: "Hack" } }), r);

    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith({ error: "Acesso negado" });
    expect(mocks.zonesService.update).not.toHaveBeenCalled();
  });

  it("allows a distributor_admin to edit a zone of their own distributor", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(OWNER_DISTRIBUTOR_ID);
    const r = res();

    await zonesController.update(req("distributor_admin", { body: { name: "Zona Sul" } }), r);

    expect(mocks.zonesService.update).toHaveBeenCalledOnce();
    expect(r.status).not.toHaveBeenCalledWith(403);
  });

  it("lets ops edit any zone without resolving ownership", async () => {
    const r = res();

    await zonesController.update(req("ops", { body: { name: "Zona Sul" } }), r);

    expect(mocks.distributorRepository.resolveDistributorId).not.toHaveBeenCalled();
    expect(mocks.zonesService.update).toHaveBeenCalledOnce();
  });

  it("blocks a distributor_admin from creating a zone for another distributor", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(OTHER_DISTRIBUTOR_ID);
    const r = res();

    await zonesController.create(
      req("distributor_admin", {
        body: { name: "Zona Sul", distributor_id: OWNER_DISTRIBUTOR_ID },
      }),
      r
    );

    expect(r.status).toHaveBeenCalledWith(403);
    expect(mocks.zonesService.create).not.toHaveBeenCalled();
  });

  it("blocks a distributor_admin with no distributor linked", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(null);
    const r = res();

    await zonesController.remove(req("distributor_admin"), r);

    expect(r.status).toHaveBeenCalledWith(403);
    expect(mocks.zonesService.remove).not.toHaveBeenCalled();
  });

  it("returns 404 before the ownership check when the zone does not exist", async () => {
    mocks.zonesRepository.findDistributorId.mockResolvedValue(null);
    const r = res();

    await zonesController.update(req("distributor_admin", { body: { name: "Zona Sul" } }), r);

    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith({ error: "Zona não encontrada" });
  });
});

describe("listForOps", () => {
  it("forces a distributor_admin to only see their own distributor's zones", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(OWNER_DISTRIBUTOR_ID);
    mocks.zonesService.listForOps.mockResolvedValue([]);
    const r = res();

    // Sem distributor_id no query: sem o guard, veria a base inteira.
    await zonesController.listForOps(
      req("distributor_admin", { query: {}, params: {} }),
      r
    );

    expect(mocks.zonesService.listForOps).toHaveBeenCalledWith(
      expect.objectContaining({ distributor_id: OWNER_DISTRIBUTOR_ID })
    );
  });

  it("ignores a distributor_id the distributor_admin tries to inject", async () => {
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(OWNER_DISTRIBUTOR_ID);
    mocks.zonesService.listForOps.mockResolvedValue([]);
    const r = res();

    await zonesController.listForOps(
      req("distributor_admin", {
        query: { distributor_id: OTHER_DISTRIBUTOR_ID },
        params: {},
      }),
      r
    );

    expect(mocks.zonesService.listForOps).toHaveBeenCalledWith(
      expect.objectContaining({ distributor_id: OWNER_DISTRIBUTOR_ID })
    );
  });

  it("lets ops query the whole base without a distributor filter", async () => {
    mocks.zonesService.listForOps.mockResolvedValue([]);
    const r = res();

    await zonesController.listForOps(req("ops", { query: {}, params: {} }), r);

    expect(mocks.distributorRepository.resolveDistributorId).not.toHaveBeenCalled();
    expect(mocks.zonesService.listForOps).toHaveBeenCalledWith(
      expect.not.objectContaining({ distributor_id: expect.anything() })
    );
  });
});

describe("mapeamento de erro de domínio para HTTP", () => {
  it.each([
    ["COVERAGE_CONFLICT", 409],
    ["DUPLICATE_ZONE_NAME", 409],
    ["ZONE_HAS_OPEN_ORDERS", 409],
    ["ZONE_NOT_FOUND", 404],
    ["DISTRIBUTOR_NOT_FOUND", 404],
    ["SAME_DISTRIBUTOR", 400],
  ])("maps %s to %i", async (code, status) => {
    mocks.zonesService.update.mockRejectedValue(new ZoneServiceError(code, "erro de domínio"));
    const r = res();

    await zonesController.update(req("ops", { body: { name: "Zona Sul" } }), r);

    expect(r.status).toHaveBeenCalledWith(status);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "erro de domínio", code })
    );
  });

  it("returns 500 and logs for an unexpected error", async () => {
    mocks.zonesService.update.mockRejectedValue(new Error("boom"));
    const r = res();

    await zonesController.update(req("ops", { body: { name: "Zona Sul" } }), r);

    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json).toHaveBeenCalledWith({ error: "Erro interno" });
    expect(mocks.logError).toHaveBeenCalled();
  });

  it("forwards conflict details so the UI can list what was blocked", async () => {
    mocks.zonesService.update.mockRejectedValue(
      new ZoneServiceError("COVERAGE_CONFLICT", "conflito", {
        conflicts: [{ zone_name: "JF — Norte" }],
      })
    );
    const r = res();

    await zonesController.update(req("ops", { body: { name: "Zona Sul" } }), r);

    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: { conflicts: [{ zone_name: "JF — Norte" }] } })
    );
  });
});

describe("validação de payload", () => {
  it("rejects an empty patch with 400", async () => {
    const r = res();

    await zonesController.update(req("ops", { body: {} }), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(mocks.zonesService.update).not.toHaveBeenCalled();
  });

  it("rejects a coverage entry with neither neighborhood nor zip", async () => {
    const r = res();

    await zonesController.addCoverage(req("ops", { body: {} }), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(mocks.zonesService.addCoverage).not.toHaveBeenCalled();
  });
});
