import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

const { productsRepository } = await import("./products.repository.js");

const productId = "3f9a2b1c-1111-4222-8333-444455556666";

function makeTx() {
  return {
    product: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("productsRepository create/update com tx opcional", () => {
  it("create usa a tx quando fornecida, sem tocar o client padrao", async () => {
    const tx = makeTx();
    const created = { id: productId, name: "Água 20L" };
    tx.product.create.mockResolvedValue(created);

    const data = { name: "Água 20L", price_cents: 1500 };
    const result = await productsRepository.create(data, tx as never);

    expect(result).toEqual(created);
    expect(tx.product.create).toHaveBeenCalledWith({
      data,
      select: expect.objectContaining({ id: true, name: true, kind: true, is_active: true }),
    });
    expect(mocks.prisma.product.create).not.toHaveBeenCalled();
  });

  it("create usa o client padrao sem tx", async () => {
    mocks.prisma.product.create.mockResolvedValue({ id: productId });

    await productsRepository.create({ name: "Água 20L", price_cents: 1500 });

    expect(mocks.prisma.product.create).toHaveBeenCalledTimes(1);
  });

  it("update usa a tx quando fornecida, sem tocar o client padrao", async () => {
    const tx = makeTx();
    const updated = { id: productId, is_active: true };
    tx.product.update.mockResolvedValue(updated);

    const result = await productsRepository.update(productId, { price_cents: 1600 }, tx as never);

    expect(result).toEqual(updated);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: productId },
      data: { price_cents: 1600 },
      select: expect.objectContaining({ id: true, name: true, kind: true, is_active: true }),
    });
    expect(mocks.prisma.product.update).not.toHaveBeenCalled();
  });

  it("update usa o client padrao sem tx", async () => {
    mocks.prisma.product.update.mockResolvedValue({ id: productId });

    await productsRepository.update(productId, { is_active: false });

    expect(mocks.prisma.product.update).toHaveBeenCalledTimes(1);
  });
});
