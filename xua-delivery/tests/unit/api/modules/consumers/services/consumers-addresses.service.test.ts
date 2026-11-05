import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = { __tx: true };
  return {
    tx,
    prisma: { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
    repo: {
      findZoneCoverage: vi.fn(),
      countActiveAddresses: vi.fn(),
      clearDefaultAddresses: vi.fn(),
      createAddress: vi.fn(),
      findAddressOwnedBy: vi.fn(),
      updateAddress: vi.fn(),
      archiveAddress: vi.fn(),
      findLatestActiveAddress: vi.fn(),
    },
  };
});

vi.mock("@api/infra/prisma/client.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("@api/infra/cep/viacep.js", () => ({ fetchCep: vi.fn() }));
vi.mock("@api/modules/consumers/repository/consumers.repository.js", () => ({
  consumerRepository: mocks.repo,
}));

const { consumersService } = await import("@api/modules/consumers/services/consumers.service.js");

const CONSUMER = "11111111-1111-4111-8111-111111111111";
const ADDRESS = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const NEW_ADDRESS = {
  label: "  Casa  ",
  zip_code: "36010-000",
  street: "Rua Halfeld",
  number: "450",
  neighborhood: "Centro",
  city: "Juiz de Fora",
  state: "MG",
  is_default: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.findZoneCoverage.mockResolvedValue({ zone_id: "zone-1" });
  mocks.repo.createAddress.mockImplementation(async (data: object) => ({ id: ADDRESS, ...data }));
  mocks.repo.updateAddress.mockImplementation(async (id: string, data: object) => ({ id, ...data }));
});

describe("consumersService.createAddress", () => {
  it("primeiro endereço nasce como principal e guarda o apelido", async () => {
    mocks.repo.countActiveAddresses.mockResolvedValue(0);

    const result = await consumersService.createAddress(CONSUMER, NEW_ADDRESS);

    expect(mocks.repo.clearDefaultAddresses).toHaveBeenCalledWith(CONSUMER, mocks.tx);
    expect(mocks.repo.createAddress).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: true, label: "Casa", zone_id: "zone-1" }),
      mocks.tx,
    );
    expect(result).toEqual({ address: expect.objectContaining({ id: ADDRESS }) });
  });

  it("endereços seguintes não roubam o principal sem pedido explícito", async () => {
    mocks.repo.countActiveAddresses.mockResolvedValue(2);

    await consumersService.createAddress(CONSUMER, { ...NEW_ADDRESS, label: undefined as unknown as string });

    expect(mocks.repo.clearDefaultAddresses).not.toHaveBeenCalled();
    expect(mocks.repo.createAddress).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: false, label: null }),
      mocks.tx,
    );
  });

  it("sem cobertura não cria nada", async () => {
    mocks.repo.findZoneCoverage.mockResolvedValue(null);

    const result = await consumersService.createAddress(CONSUMER, NEW_ADDRESS);

    expect(result).toEqual({ code: "NO_COVERAGE" });
    expect(mocks.repo.createAddress).not.toHaveBeenCalled();
  });
});

describe("consumersService.updateAddress", () => {
  it("devolve null para endereço de outra pessoa (ou arquivado)", async () => {
    mocks.repo.findAddressOwnedBy.mockResolvedValue(null);

    const result = await consumersService.updateAddress(CONSUMER, ADDRESS, { number: "10" });

    expect(result).toBeNull();
    expect(mocks.repo.updateAddress).not.toHaveBeenCalled();
  });

  it("marcar como principal limpa o principal anterior", async () => {
    mocks.repo.findAddressOwnedBy.mockResolvedValue({ id: ADDRESS, is_default: false });

    await consumersService.updateAddress(CONSUMER, ADDRESS, { is_default: true });

    expect(mocks.repo.clearDefaultAddresses).toHaveBeenCalledWith(CONSUMER, mocks.tx);
    expect(mocks.repo.updateAddress).toHaveBeenCalledWith(ADDRESS, { is_default: true }, mocks.tx);
  });

  it("normaliza apelido e complemento vazios para null e não toca no principal", async () => {
    mocks.repo.findAddressOwnedBy.mockResolvedValue({ id: ADDRESS, is_default: true });

    await consumersService.updateAddress(CONSUMER, ADDRESS, { label: "  ", complement: "", number: " 12 " });

    expect(mocks.repo.clearDefaultAddresses).not.toHaveBeenCalled();
    expect(mocks.repo.updateAddress).toHaveBeenCalledWith(
      ADDRESS,
      { label: null, complement: null, number: "12" },
      mocks.tx,
    );
  });
});

describe("consumersService.archiveAddress", () => {
  it("arquiva e promove o endereço mais recente quando o principal sai", async () => {
    mocks.repo.findAddressOwnedBy.mockResolvedValue({ id: ADDRESS, is_default: true });
    mocks.repo.findLatestActiveAddress.mockResolvedValue({ id: OTHER });

    const ok = await consumersService.archiveAddress(CONSUMER, ADDRESS);

    expect(ok).toBe(true);
    expect(mocks.repo.archiveAddress).toHaveBeenCalledWith(ADDRESS, mocks.tx);
    expect(mocks.repo.updateAddress).toHaveBeenCalledWith(OTHER, { is_default: true }, mocks.tx);
  });

  it("arquivar um endereço comum não mexe no principal", async () => {
    mocks.repo.findAddressOwnedBy.mockResolvedValue({ id: ADDRESS, is_default: false });

    await consumersService.archiveAddress(CONSUMER, ADDRESS);

    expect(mocks.repo.findLatestActiveAddress).not.toHaveBeenCalled();
    expect(mocks.repo.updateAddress).not.toHaveBeenCalled();
  });

  it("endereço que não é do consumidor devolve false sem arquivar", async () => {
    mocks.repo.findAddressOwnedBy.mockResolvedValue(null);

    const ok = await consumersService.archiveAddress(CONSUMER, ADDRESS);

    expect(ok).toBe(false);
    expect(mocks.repo.archiveAddress).not.toHaveBeenCalled();
  });
});
