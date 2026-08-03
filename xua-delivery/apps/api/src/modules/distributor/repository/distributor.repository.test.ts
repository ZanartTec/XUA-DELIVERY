import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    zoneCoverage: {
      findMany: vi.fn(),
    },
    distributor: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: {
      groupBy: vi.fn(),
    },
    zone: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    consumer: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
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

describe("distributorRepository.create / update", () => {
  it("cria distribuidora repassando os dados recebidos", async () => {
    mocks.prisma.distributor.create.mockResolvedValue({ id: distributorA, name: "Alpha" });

    const result = await distributorRepository.create({ name: "Alpha", cnpj: "11222333000181" });

    expect(mocks.prisma.distributor.create).toHaveBeenCalledWith({
      data: { name: "Alpha", cnpj: "11222333000181" },
    });
    expect(result).toEqual({ id: distributorA, name: "Alpha" });
  });

  it("atualiza distribuidora por id", async () => {
    mocks.prisma.distributor.update.mockResolvedValue({ id: distributorA, is_active: false });

    const result = await distributorRepository.update(distributorA, { is_active: false });

    expect(mocks.prisma.distributor.update).toHaveBeenCalledWith({
      where: { id: distributorA },
      data: { is_active: false },
    });
    expect(result).toEqual({ id: distributorA, is_active: false });
  });
});

describe("distributorRepository.createAdmin / createDriver", () => {
  it("cria admin com role DISTRIBUTOR_ADMIN", async () => {
    mocks.prisma.consumer.create.mockResolvedValue({ id: "admin-1", role: "DISTRIBUTOR_ADMIN" });

    await distributorRepository.createAdmin({
      name: "Admin",
      email: "admin@xua.test",
      phone: "11999999999",
      password_hash: "hash",
      distributor_id: distributorA,
    });

    expect(mocks.prisma.consumer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "DISTRIBUTOR_ADMIN", distributor_id: distributorA }),
      })
    );
  });

  it("cria motorista com role DRIVER", async () => {
    mocks.prisma.consumer.create.mockResolvedValue({ id: "driver-1", role: "DRIVER" });

    await distributorRepository.createDriver({
      name: "Driver",
      email: "driver@xua.test",
      password_hash: "hash",
      distributor_id: distributorA,
    });

    expect(mocks.prisma.consumer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "DRIVER", distributor_id: distributorA }),
      })
    );
  });
});

describe("distributorRepository.findAllForOps", () => {
  it("lista TODAS as distribuidoras (ativas e inativas) com campos do CRUD e mp_connected calculado", async () => {
    mocks.prisma.distributor.findMany.mockResolvedValue([
      {
        id: distributorA,
        name: "Alpha",
        cnpj: "11222333000181",
        phone: "11999999999",
        email: "alpha@xua.test",
        acceptance_sla_seconds: 180,
        allows_consumer_choice: true,
        is_active: true,
        payment_settings: { mp_access_token_enc: "enc", mp_webhook_secret_enc: "enc" },
      },
      {
        id: distributorB,
        name: "Beta",
        cnpj: "44555666000181",
        phone: "11988888888",
        email: "beta@xua.test",
        acceptance_sla_seconds: 180,
        allows_consumer_choice: false,
        is_active: false,
        payment_settings: null,
      },
    ]);

    const result = await distributorRepository.findAllForOps();

    // NÃO deve filtrar por is_active — precisa cobrir distribuidoras desativadas
    expect(mocks.prisma.distributor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          cnpj: true,
          phone: true,
          email: true,
          acceptance_sla_seconds: true,
          allows_consumer_choice: true,
          is_active: true,
        }),
      })
    );
    const [callArgs] = mocks.prisma.distributor.findMany.mock.calls[0]!;
    expect(callArgs.where).toBeUndefined();

    expect(result).toEqual([
      {
        id: distributorA,
        name: "Alpha",
        cnpj: "11222333000181",
        phone: "11999999999",
        email: "alpha@xua.test",
        acceptance_sla_seconds: 180,
        allows_consumer_choice: true,
        is_active: true,
        mp_connected: true,
      },
      {
        id: distributorB,
        name: "Beta",
        cnpj: "44555666000181",
        phone: "11988888888",
        email: "beta@xua.test",
        acceptance_sla_seconds: 180,
        allows_consumer_choice: false,
        is_active: false,
        mp_connected: false,
      },
    ]);
  });
});

describe("distributorRepository.findDriversByDistributor", () => {
  it("retorna email, phone e is_active dos motoristas vinculados (não só id/name)", async () => {
    mocks.prisma.consumer.findMany.mockResolvedValue([
      {
        id: "driver-1",
        name: "Driver One",
        email: "driver1@xua.test",
        phone: "11977777777",
        role: "DRIVER",
        is_active: true,
        distributor_id: distributorA,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await distributorRepository.findDriversByDistributor(distributorA);

    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "DRIVER", distributor_id: distributorA },
        select: expect.objectContaining({ email: true, phone: true, is_active: true }),
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "driver-1",
        name: "Driver One",
        email: "driver1@xua.test",
        phone: "11977777777",
        is_active: true,
      }),
    ]);
  });
});

describe("distributorRepository.findAllDriversForOps", () => {
  it("retorna motoristas de qualquer distribuidora com o nome da distribuidora vinculada", async () => {
    mocks.prisma.consumer.findMany.mockResolvedValue([
      {
        id: "driver-1",
        name: "Driver One",
        email: "driver1@xua.test",
        phone: "11977777777",
        role: "DRIVER",
        is_active: true,
        distributor_id: distributorA,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        distributor: { id: distributorA, name: "Alpha" },
      },
    ]);

    const result = await distributorRepository.findAllDriversForOps();

    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "DRIVER" },
        select: expect.objectContaining({
          email: true,
          phone: true,
          is_active: true,
          distributor: { select: { id: true, name: true } },
        }),
        orderBy: [{ distributor: { name: "asc" } }, { name: "asc" }],
      })
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "driver-1",
        name: "Driver One",
        distributor: { id: distributorA, name: "Alpha" },
      }),
    ]);
  });

  it("retorna distributor: null para motorista órfão (sem distribuidora vinculada)", async () => {
    mocks.prisma.consumer.findMany.mockResolvedValue([
      {
        id: "driver-orphan",
        name: "Driver Orphan",
        email: "orphan@xua.test",
        phone: "11966666666",
        role: "DRIVER",
        is_active: true,
        distributor_id: null,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        distributor: null,
      },
    ]);

    const result = await distributorRepository.findAllDriversForOps();

    expect(result).toEqual([
      expect.objectContaining({
        id: "driver-orphan",
        distributor_id: null,
        distributor: null,
      }),
    ]);
  });
});

describe("distributorRepository.findUnlinkedDrivers / linkDriverToDistributor", () => {
  it("lista motoristas sem distributor_id", async () => {
    mocks.prisma.consumer.findMany.mockResolvedValue([{ id: "driver-orphan", distributor_id: null }]);

    const result = await distributorRepository.findUnlinkedDrivers();

    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "DRIVER", distributor_id: null } })
    );
    expect(result).toEqual([{ id: "driver-orphan", distributor_id: null }]);
  });

  it("vincula motorista a uma distribuidora", async () => {
    mocks.prisma.consumer.update.mockResolvedValue({ id: "driver-orphan", distributor_id: distributorA });

    const result = await distributorRepository.linkDriverToDistributor("driver-orphan", distributorA);

    expect(mocks.prisma.consumer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "driver-orphan" },
        data: { distributor_id: distributorA },
      })
    );
    expect(result).toEqual({ id: "driver-orphan", distributor_id: distributorA });
  });
});
