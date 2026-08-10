import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActorType } from "@xua/shared/enums";

const ZONE_ID = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const OTHER_ZONE_ID = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236910";
const TARGET_DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236911";
const ACTOR = { type: ActorType.OPS, id: "7e1d7b55-3f52-4d10-aac3-74387c236999" };

const mocks = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  transaction: vi.fn(),
  auditEmit: vi.fn(),
  zonesRepository: {
    findAllActive: vi.fn(),
    findAllForOps: vi.fn(),
    findCoverageByZone: vi.fn(),
    findById: vi.fn(),
    findByNameInDistributor: vi.fn(),
    findDistributor: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    transfer: vi.fn(),
    createCoverage: vi.fn(),
    deleteCoverage: vi.fn(),
    findConflictingCoverage: vi.fn(),
    findSelfOverlapConflicts: vi.fn(),
    findTransferConflicts: vi.fn(),
    findExternalOverlaps: vi.fn(),
    countOpenOrders: vi.fn(),
    countAddresses: vi.fn(),
  },
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.logInfo, error: mocks.logError }),
}));
vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));
vi.mock("../../audit/audit.repository.js", () => ({
  auditRepository: { emit: mocks.auditEmit },
}));
vi.mock("../repository/zones.repository.js", () => ({
  zonesRepository: mocks.zonesRepository,
}));

const { zonesService } = await import("./zones.service.js");

/** Zona base usada nos testes. `findById` não inclui cobertura (é paginada à parte). */
function zoneFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ZONE_ID,
    name: "JF — Centro",
    distributor_id: DISTRIBUTOR_ID,
    is_active: true,
    ...overrides,
  };
}

/** Linha de conflito como o repository devolve — já flat, já filtrada no banco. */
function conflictRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cov-x",
    neighborhood: "Centro",
    zip_code: null,
    zone_id: OTHER_ZONE_ID,
    zone_name: "JF — Norte",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Executa o callback da transação com um tx fake.
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  mocks.auditEmit.mockResolvedValue({});
  mocks.zonesRepository.findById.mockResolvedValue(zoneFixture());
  mocks.zonesRepository.findByNameInDistributor.mockResolvedValue(null);
  mocks.zonesRepository.findDistributor.mockResolvedValue({
    id: DISTRIBUTOR_ID,
    name: "Xuá JF",
    is_active: true,
  });
  mocks.zonesRepository.findConflictingCoverage.mockResolvedValue([]);
  mocks.zonesRepository.findSelfOverlapConflicts.mockResolvedValue([]);
  mocks.zonesRepository.findTransferConflicts.mockResolvedValue([]);
  mocks.zonesRepository.findExternalOverlaps.mockResolvedValue([]);
  mocks.zonesRepository.countOpenOrders.mockResolvedValue(0);
  mocks.zonesRepository.countAddresses.mockResolvedValue(0);
  mocks.zonesRepository.create.mockImplementation(async (data: Record<string, unknown>) => ({
    id: ZONE_ID,
    ...data,
  }));
  mocks.zonesRepository.update.mockResolvedValue(zoneFixture());
  mocks.zonesRepository.transfer.mockResolvedValue(
    zoneFixture({ distributor_id: TARGET_DISTRIBUTOR_ID })
  );
  mocks.zonesRepository.createCoverage.mockImplementation(
    async (data: Record<string, unknown>) => ({ id: "new-cov", ...data })
  );
});

describe("zonesService.listForOps", () => {
  const FILTERS = { status: "active" as const, limit: 20, offset: 40 };

  it("returns pagination metadata alongside the page of zones", async () => {
    mocks.zonesRepository.findAllForOps.mockResolvedValue({
      zones: [zoneFixture()],
      total: 137,
    });

    const result = await zonesService.listForOps(FILTERS);

    expect(result.pagination).toEqual({ limit: 20, offset: 40, total: 137 });
    expect(result.zones).toHaveLength(1);
  });

  it("passes every filter through to the repository — nothing is filtered in memory", async () => {
    mocks.zonesRepository.findAllForOps.mockResolvedValue({ zones: [], total: 0 });

    await zonesService.listForOps({
      ...FILTERS,
      distributor_id: DISTRIBUTOR_ID,
      q: "centro",
      coverage: "36010-000",
      status: "all",
    });

    expect(mocks.zonesRepository.findAllForOps).toHaveBeenCalledWith(
      expect.objectContaining({
        distributor_id: DISTRIBUTOR_ID,
        q: "centro",
        coverage: "36010-000",
        status: "all",
        limit: 20,
        offset: 40,
      })
    );
  });
});

describe("zonesService.listCoverage", () => {
  it("paginates a zone's coverage instead of returning all rows", async () => {
    mocks.zonesRepository.findCoverageByZone.mockResolvedValue({
      coverage: [{ id: "cov-1", neighborhood: "Centro", zip_code: "36010-000" }],
      total: 3723,
    });

    const result = await zonesService.listCoverage(ZONE_ID, { limit: 20, offset: 0 });

    expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 3723 });
    expect(result.coverage).toHaveLength(1);
  });

  it("throws ZONE_NOT_FOUND for an unknown zone", async () => {
    mocks.zonesRepository.findById.mockResolvedValue(null);

    await expect(
      zonesService.listCoverage(ZONE_ID, { limit: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "ZONE_NOT_FOUND" });
  });
});

describe("zonesService.create", () => {
  it("rejects a zone name already used by the same distributor", async () => {
    mocks.zonesRepository.findByNameInDistributor.mockResolvedValue({
      id: OTHER_ZONE_ID,
      name: "Zona Sul",
    });

    await expect(
      zonesService.create(
        { name: "zona sul", distributor_id: DISTRIBUTOR_ID, is_active: true },
        ACTOR
      )
    ).rejects.toMatchObject({ name: "ZoneServiceError", code: "DUPLICATE_ZONE_NAME" });
  });

  it("rejects creating a zone on an inactive distributor", async () => {
    mocks.zonesRepository.findDistributor.mockResolvedValue({
      id: DISTRIBUTOR_ID,
      name: "Xuá JF",
      is_active: false,
    });

    await expect(
      zonesService.create(
        { name: "Zona Sul", distributor_id: DISTRIBUTOR_ID, is_active: true },
        ACTOR
      )
    ).rejects.toMatchObject({ code: "DISTRIBUTOR_INACTIVE" });
  });

  it("emits an audit event inside the same transaction as the write", async () => {
    await zonesService.create(
      { name: "Zona Sul", distributor_id: DISTRIBUTOR_ID, is_active: true },
      ACTOR
    );

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ZONE_CREATED", actor: ACTOR }),
      expect.anything()
    );
  });
});

describe("zonesService.addCoverageBulk", () => {
  it("blocks entries already served by another ACTIVE zone of the same distributor", async () => {
    mocks.zonesRepository.findConflictingCoverage.mockResolvedValue([conflictRow()]);

    const result = await zonesService.addCoverageBulk(
      ZONE_ID,
      [{ neighborhood: "Centro" }],
      ACTOR
    );

    expect(result.created_count).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.zone_name).toBe("JF — Norte");
    expect(mocks.zonesRepository.createCoverage).not.toHaveBeenCalled();
  });

  it("matches conflicts ignoring accent and case", async () => {
    mocks.zonesRepository.findConflictingCoverage.mockResolvedValue([
      conflictRow({ neighborhood: "São Pedro", zip_code: null, zone_name: "JF — Sul" }),
    ]);

    const result = await zonesService.addCoverageBulk(
      ZONE_ID,
      [{ neighborhood: "sao  pedro" }],
      ACTOR
    );

    expect(result.created_count).toBe(0);
    expect(result.conflicts).toHaveLength(1);
  });

  it("imports the non-conflicting entries and skips only the conflicting ones", async () => {
    mocks.zonesRepository.findConflictingCoverage.mockResolvedValue([conflictRow()]);

    const result = await zonesService.addCoverageBulk(
      ZONE_ID,
      [{ neighborhood: "Centro" }, { neighborhood: "Granbery" }],
      ACTOR
    );

    expect(result.created_count).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(mocks.zonesRepository.createCoverage).toHaveBeenCalledOnce();
    expect(mocks.zonesRepository.createCoverage).toHaveBeenCalledWith(
      expect.objectContaining({ neighborhood: "Granbery", distributor_id: DISTRIBUTOR_ID }),
      expect.anything()
    );
  });

  it("deduplicates repeated lines inside the pasted list", async () => {
    const result = await zonesService.addCoverageBulk(
      ZONE_ID,
      [{ zip_code: "36010-000" }, { zip_code: "36010-000" }],
      ACTOR
    );

    expect(result.duplicates_in_payload).toBe(1);
    expect(result.created_count).toBe(1);
  });

  it("only checks candidates matching the payload — never the whole distributor", async () => {
    await zonesService.addCoverageBulk(ZONE_ID, [{ neighborhood: "Centro" }], ACTOR);

    expect(mocks.zonesRepository.findConflictingCoverage).toHaveBeenCalledWith(
      DISTRIBUTOR_ID,
      [{ neighborhood: "Centro" }],
      ZONE_ID
    );
  });

  it("only WARNS when another distributor covers the same area — never blocks", async () => {
    mocks.zonesRepository.findExternalOverlaps.mockResolvedValue([
      {
        neighborhood: "Centro",
        zip_code: null,
        zone: {
          id: "zone-outra",
          name: "JF — Centro (ÁguaFácil)",
          distributor: { id: TARGET_DISTRIBUTOR_ID, name: "ÁguaFácil" },
        },
      },
    ]);

    const result = await zonesService.addCoverageBulk(
      ZONE_ID,
      [{ neighborhood: "Centro" }],
      ACTOR
    );

    expect(result.created_count).toBe(1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.distributor_name).toBe("ÁguaFácil");
  });
});

describe("zonesService.addCoverage", () => {
  it("throws COVERAGE_CONFLICT when the single entry is already served", async () => {
    mocks.zonesRepository.findConflictingCoverage.mockResolvedValue([
      conflictRow({ neighborhood: null, zip_code: "36010-000" }),
    ]);

    await expect(
      zonesService.addCoverage(ZONE_ID, { zip_code: "36010-000" }, ACTOR)
    ).rejects.toMatchObject({ code: "COVERAGE_CONFLICT" });
  });
});

describe("zonesService.transfer", () => {
  it("refuses to transfer a zone that still has orders in progress", async () => {
    mocks.zonesRepository.findDistributor.mockResolvedValue({
      id: TARGET_DISTRIBUTOR_ID,
      name: "ÁguaFácil",
      is_active: true,
    });
    mocks.zonesRepository.countOpenOrders.mockResolvedValue(3);

    await expect(
      zonesService.transfer(ZONE_ID, TARGET_DISTRIBUTOR_ID, ACTOR)
    ).rejects.toMatchObject({ code: "ZONE_HAS_OPEN_ORDERS" });
    expect(mocks.zonesRepository.transfer).not.toHaveBeenCalled();
  });

  it("refuses when the destination already covers part of the zone", async () => {
    mocks.zonesRepository.findDistributor.mockResolvedValue({
      id: TARGET_DISTRIBUTOR_ID,
      name: "ÁguaFácil",
      is_active: true,
    });
    mocks.zonesRepository.findTransferConflicts.mockResolvedValue([
      conflictRow({ zone_id: "zone-destino", zone_name: "Centro AF" }),
    ]);

    await expect(
      zonesService.transfer(ZONE_ID, TARGET_DISTRIBUTOR_ID, ACTOR)
    ).rejects.toMatchObject({ code: "COVERAGE_CONFLICT" });
  });

  it("checks conflicts entirely in the database — never loads the zone's own coverage", async () => {
    mocks.zonesRepository.findDistributor.mockResolvedValue({
      id: TARGET_DISTRIBUTOR_ID,
      name: "ÁguaFácil",
      is_active: true,
    });

    await zonesService.transfer(ZONE_ID, TARGET_DISTRIBUTOR_ID, ACTOR);

    expect(mocks.zonesRepository.findTransferConflicts).toHaveBeenCalledWith(
      ZONE_ID,
      TARGET_DISTRIBUTOR_ID
    );
  });

  it("rejects transferring to the distributor that already owns the zone", async () => {
    await expect(
      zonesService.transfer(ZONE_ID, DISTRIBUTOR_ID, ACTOR)
    ).rejects.toMatchObject({ code: "SAME_DISTRIBUTOR" });
  });

  it("transfers and audits when there is no open order nor conflict", async () => {
    mocks.zonesRepository.findDistributor.mockResolvedValue({
      id: TARGET_DISTRIBUTOR_ID,
      name: "ÁguaFácil",
      is_active: true,
    });

    await zonesService.transfer(ZONE_ID, TARGET_DISTRIBUTOR_ID, ACTOR);

    expect(mocks.zonesRepository.transfer).toHaveBeenCalledWith(
      ZONE_ID,
      TARGET_DISTRIBUTOR_ID,
      expect.anything()
    );
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ZONE_TRANSFERRED" }),
      expect.anything()
    );
  });
});

describe("zonesService.update", () => {
  it("refuses to reactivate a zone whose coverage is now served by another zone", async () => {
    mocks.zonesRepository.findById.mockResolvedValue(zoneFixture({ is_active: false }));
    mocks.zonesRepository.findSelfOverlapConflicts.mockResolvedValue([conflictRow()]);

    await expect(
      zonesService.update(ZONE_ID, { is_active: true }, ACTOR)
    ).rejects.toMatchObject({ code: "COVERAGE_CONFLICT" });
  });

  it("checks reactivation conflicts entirely in the database", async () => {
    mocks.zonesRepository.findById.mockResolvedValue(zoneFixture({ is_active: false }));

    await zonesService.update(ZONE_ID, { is_active: true }, ACTOR);

    expect(mocks.zonesRepository.findSelfOverlapConflicts).toHaveBeenCalledWith(ZONE_ID);
  });

  it("does not check for conflicts when a zone that is already active stays active", async () => {
    await zonesService.update(ZONE_ID, { name: "Novo nome" }, ACTOR);

    expect(mocks.zonesRepository.findSelfOverlapConflicts).not.toHaveBeenCalled();
  });

  it("reports how many addresses lose coverage when deactivating", async () => {
    mocks.zonesRepository.countAddresses.mockResolvedValue(12);

    const result = await zonesService.update(ZONE_ID, { is_active: false }, ACTOR);

    expect(result.affected_addresses).toBe(12);
  });

  it("does not count addresses when the change is only a rename", async () => {
    const result = await zonesService.update(ZONE_ID, { name: "Novo nome" }, ACTOR);

    expect(result.affected_addresses).toBe(0);
    expect(mocks.zonesRepository.countAddresses).not.toHaveBeenCalled();
  });

  it("throws ZONE_NOT_FOUND for an unknown zone", async () => {
    mocks.zonesRepository.findById.mockResolvedValue(null);

    await expect(
      zonesService.update(ZONE_ID, { name: "X" }, ACTOR)
    ).rejects.toMatchObject({ code: "ZONE_NOT_FOUND" });
  });
});
