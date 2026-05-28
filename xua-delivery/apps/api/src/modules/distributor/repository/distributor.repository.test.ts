import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    zoneCoverage: {
      findMany: vi.fn(),
    },
    distributor: {
      findMany: vi.fn(),
    },
    order: {
      groupBy: vi.fn(),
    },
    zone: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

const { distributorRepository } = await import("./distributor.repository.js");

const originZoneId = "7e1d7b55-3f52-4d10-aac3-74387c236401";
const distributorA = "7e1d7b55-3f52-4d10-aac3-74387c236402";
const distributorB = "7e1d7b55-3f52-4d10-aac3-74387c236403";
const distributorC = "7e1d7b55-3f52-4d10-aac3-74387c236404";
const resolvedZoneId = "7e1d7b55-3f52-4d10-aac3-74387c236405";

function capacitySlot(date: string, capacity_reserved: number, capacity_total: number) {
  return {
    delivery_date: new Date(`${date}T00:00:00.000Z`),
    window: "MORNING",
    capacity_reserved,
    capacity_total,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.zoneCoverage.findMany.mockResolvedValue([
    { neighborhood: "Centro", zip_code: null },
  ]);
  mocks.prisma.order.groupBy.mockResolvedValue([]);
});

describe("distributorRepository.findAvailableForZone", () => {
  it("filtra por cobertura e capacidade usando Prisma e calcula ranking por NPS", async () => {
    mocks.prisma.distributor.findMany.mockResolvedValue([
      {
        id: distributorA,
        name: "Alpha",
        zones: [
          {
            id: resolvedZoneId,
            coverage: [{ neighborhood: "Centro", zip_code: null }],
            capacity_slots: [
              capacitySlot("2026-05-28", 0, 2),
              capacitySlot("2026-05-30", 1, 3),
            ],
          },
        ],
      },
      {
        id: distributorB,
        name: "Beta",
        zones: [
          {
            id: "zone-full",
            coverage: [{ neighborhood: "Centro", zip_code: null }],
            capacity_slots: [capacitySlot("2026-05-28", 2, 2)],
          },
        ],
      },
    ]);
    mocks.prisma.order.groupBy.mockResolvedValue([
      { distributor_id: distributorA, _avg: { nps_score: 8.666 } },
    ]);

    const result = await distributorRepository.findAvailableForZone(
      originZoneId,
      "2026-05-28",
      "morning"
    );

    expect(mocks.prisma.distributor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          is_active: true,
          allows_consumer_choice: true,
        }),
      })
    );
    expect(result).toEqual([
      {
        id: distributorA,
        name: "Alpha",
        avg_nps: 8.7,
        next_available_date: "2026-05-28",
      },
    ]);
  });

  it("mantem NPS nulo por ultimo e ordena nomes como desempate", async () => {
    mocks.prisma.distributor.findMany.mockResolvedValue([
      { id: distributorA, name: "Alpha", zones: [{ coverage: [{ neighborhood: "Centro", zip_code: null }] }] },
      { id: distributorB, name: "Beta", zones: [{ coverage: [{ neighborhood: "Centro", zip_code: null }] }] },
      { id: distributorC, name: "Gamma", zones: [{ coverage: [{ neighborhood: "Centro", zip_code: null }] }] },
    ]);
    mocks.prisma.order.groupBy.mockResolvedValue([
      { distributor_id: distributorA, _avg: { nps_score: 8 } },
      { distributor_id: distributorB, _avg: { nps_score: 9 } },
    ]);

    const result = await distributorRepository.findAvailableForZone(originZoneId);

    expect(result).toEqual([
      { id: distributorB, name: "Beta", avg_nps: 9, next_available_date: null },
      { id: distributorA, name: "Alpha", avg_nps: 8, next_available_date: null },
      { id: distributorC, name: "Gamma", avg_nps: null, next_available_date: null },
    ]);
  });
});

describe("distributorRepository.resolveCoveredZone", () => {
  it("resolve a zona coberta por bairro ou CEP sem SQL bruto", async () => {
    mocks.prisma.zone.findFirst.mockResolvedValue({ id: resolvedZoneId });

    await expect(distributorRepository.resolveCoveredZone(distributorA, originZoneId)).resolves.toBe(
      resolvedZoneId
    );
    expect(mocks.prisma.zone.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ distributor_id: distributorA, is_active: true }),
      })
    );
  });
});

describe("distributorRepository.validateDistributorForZone", () => {
  it("valida capacidade disponivel em memoria apos consulta Prisma", async () => {
    mocks.prisma.zone.findMany.mockResolvedValue([
      { id: "zone-full", capacity_slots: [{ capacity_reserved: 2, capacity_total: 2 }] },
      { id: resolvedZoneId, capacity_slots: [{ capacity_reserved: 1, capacity_total: 3 }] },
    ]);

    await expect(
      distributorRepository.validateDistributorForZone(distributorA, originZoneId, "2026-05-28", "morning")
    ).resolves.toEqual({ valid: true, resolvedZoneId });
  });
});
