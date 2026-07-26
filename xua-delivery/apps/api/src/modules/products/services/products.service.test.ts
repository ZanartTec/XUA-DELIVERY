import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  deleteCacheKey: vi.fn(),
  getCacheJson: vi.fn(),
  setCacheJson: vi.fn(),
  repository: {
    findActive: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  provisionForProduct: vi.fn(),
}));

vi.mock("../../../infra/redis/cache.js", () => ({
  deleteCacheKey: mocks.deleteCacheKey,
  getCacheJson: mocks.getCacheJson,
  setCacheJson: mocks.setCacheJson,
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("../../inventory/services/inventory-item-provisioning.service.js", () => ({
  inventoryItemProvisioningService: { provisionForProduct: mocks.provisionForProduct },
}));

vi.mock("../repository/products.repository.js", () => ({
  productsRepository: mocks.repository,
}));

vi.mock("../../../infra/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

const { productsService } = await import("./products.service.js");

const tx = { tx: true };
const productId = "3f9a2b1c-1111-4222-8333-444455556666";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    name: "Água 20L",
    description: null,
    image_url: null,
    price_cents: 1500,
    kind: "WATER",
    bottle_product_id: null,
    is_active: true,
    categories: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx));
  mocks.provisionForProduct.mockResolvedValue({ item: { id: "item-1" }, created: true });
});

describe("productsService.create", () => {
  const input = { name: "Água 20L", price_cents: 1500 };

  it("cria produto e provisiona item de estoque na mesma transacao", async () => {
    const created = product();
    mocks.repository.create.mockResolvedValue(created);

    const result = await productsService.create(input);

    expect(result).toEqual(created);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.repository.create).toHaveBeenCalledWith(input, tx);
    expect(mocks.provisionForProduct).toHaveBeenCalledWith(created, tx);
    expect(mocks.deleteCacheKey).toHaveBeenCalledWith("products:active");
  });

  it("propaga erro do provisionamento (transacao inteira falha, produto nao persiste)", async () => {
    mocks.repository.create.mockResolvedValue(product());
    mocks.provisionForProduct.mockRejectedValue(new Error("provisioning failed"));
    // Transacao real desfaz o produto quando o callback rejeita.
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx));

    await expect(productsService.create(input)).rejects.toThrow("provisioning failed");
    expect(mocks.deleteCacheKey).not.toHaveBeenCalled();
  });
});

describe("productsService.update", () => {
  it("provisiona item quando o produto resultante esta ativo", async () => {
    const updated = product({ is_active: true });
    mocks.repository.update.mockResolvedValue(updated);

    const result = await productsService.update(productId, { price_cents: 1600 });

    expect(result).toEqual(updated);
    expect(mocks.repository.update).toHaveBeenCalledWith(productId, { price_cents: 1600 }, tx);
    expect(mocks.provisionForProduct).toHaveBeenCalledWith(updated, tx);
    expect(mocks.deleteCacheKey).toHaveBeenCalledWith("products:active");
  });

  it("nao provisiona quando o produto resultante esta inativo", async () => {
    const updated = product({ is_active: false });
    mocks.repository.update.mockResolvedValue(updated);

    const result = await productsService.update(productId, { is_active: false });

    expect(result).toEqual(updated);
    expect(mocks.provisionForProduct).not.toHaveBeenCalled();
    expect(mocks.deleteCacheKey).toHaveBeenCalledWith("products:active");
  });

  it("propaga erro do provisionamento no update", async () => {
    mocks.repository.update.mockResolvedValue(product({ is_active: true }));
    mocks.provisionForProduct.mockRejectedValue(new Error("provisioning failed"));

    await expect(productsService.update(productId, { name: "Nova Água" })).rejects.toThrow(
      "provisioning failed"
    );
    expect(mocks.deleteCacheKey).not.toHaveBeenCalled();
  });
});
