import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { InventoryItemType, ProductKind } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  repository: {
    findInventoryItemsByProductId: vi.fn(),
    findInventoryItemByCode: vi.fn(),
    createInventoryItem: vi.fn(),
    reactivateInventoryItem: vi.fn(),
  },
}));

vi.mock("../../../infra/logger/index.js", () => ({
  createLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}));

vi.mock("../repository/inventory.repository.js", () => ({
  inventoryRepository: mocks.repository,
}));

const { inventoryItemProvisioningService, buildInventoryItemCode } = await import(
  "./inventory-item-provisioning.service.js"
);

const tx = { tx: true } as never;
const productId = "3f9a2b1c-1111-4222-8333-444455556666";

function product(overrides: Partial<{ id: string; name: string; kind: ProductKind }> = {}) {
  return {
    id: productId,
    name: "Água 20L Premium",
    kind: ProductKind.WATER,
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "7e1d7b55-3f52-4d10-aac3-74387c236001",
    code: "AGUA20LPREMIUM-3f9a2b1c",
    name: "Água 20L Premium",
    type: InventoryItemType.SELLABLE_PRODUCT,
    product_id: productId,
    unit_label: "un",
    low_stock_threshold: 10,
    is_active: true,
    created_at: new Date("2026-01-01T12:00:00.000Z"),
    updated_at: new Date("2026-01-01T12:00:00.000Z"),
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.findInventoryItemByCode.mockResolvedValue(null);
});

describe("buildInventoryItemCode", () => {
  it("remove acentos, sobe para maiusculas e anexa 8 chars do uuid", () => {
    expect(buildInventoryItemCode("Água 20L Premium", productId)).toBe(
      "AGUA20LPREMIUM-3f9a2b1c"
    );
  });

  it("descarta caracteres fora de [A-Z0-9] e trunca o slug em 16 chars", () => {
    expect(buildInventoryItemCode("Galão de Água Mineral Cristalina!", productId)).toBe(
      "GALAODEAGUAMINER-3f9a2b1c"
    );
  });

  it("e deterministico para a mesma entrada", () => {
    const first = buildInventoryItemCode("Água 20L", productId);
    const second = buildInventoryItemCode("Água 20L", productId);

    expect(first).toBe(second);
    expect(first).toBe("AGUA20L-3f9a2b1c");
  });

  it("estende o fragmento do uuid quando solicitado (fallback de colisao)", () => {
    expect(buildInventoryItemCode("Água 20L", productId, 12)).toBe("AGUA20L-3f9a2b1c1111");
  });

  it("usa slug de fallback quando o nome nao tem caracteres validos", () => {
    expect(buildInventoryItemCode("!!!", productId)).toBe("ITEM-3f9a2b1c");
  });
});

describe("inventoryItemProvisioningService.provisionForProduct", () => {
  it("no-op quando ja existe exatamente 1 item ativo", async () => {
    const existing = item();
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([existing]);

    const result = await inventoryItemProvisioningService.provisionForProduct(product(), tx);

    expect(result).toEqual({ item: existing, created: false });
    expect(mocks.repository.createInventoryItem).not.toHaveBeenCalled();
    expect(mocks.repository.reactivateInventoryItem).not.toHaveBeenCalled();
  });

  it("retorna null e loga warn quando ha mais de 1 item ativo (conflito pre-existente)", async () => {
    const first = item({ id: "item-1" });
    const second = item({ id: "item-2", code: "OUTRO-3f9a2b1c" });
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([first, second]);

    const result = await inventoryItemProvisioningService.provisionForProduct(product(), tx);

    expect(result).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: productId,
        inventory_item_ids: ["item-1", "item-2"],
      }),
      expect.any(String)
    );
    expect(mocks.repository.createInventoryItem).not.toHaveBeenCalled();
    expect(mocks.repository.reactivateInventoryItem).not.toHaveBeenCalled();
  });

  it("reativa o item inativo mais recente quando nao ha ativo", async () => {
    const recent = item({ id: "item-recent", is_active: false });
    const older = item({
      id: "item-older",
      is_active: false,
      created_at: new Date("2025-01-01T12:00:00.000Z"),
    });
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([recent, older]);
    const reactivated = { ...recent, is_active: true };
    mocks.repository.reactivateInventoryItem.mockResolvedValue(reactivated);

    const result = await inventoryItemProvisioningService.provisionForProduct(product(), tx);

    expect(result).toEqual({ item: reactivated, created: false });
    expect(mocks.repository.reactivateInventoryItem).toHaveBeenCalledWith("item-recent", tx);
    expect(mocks.repository.createInventoryItem).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: productId,
        inventory_item_id: "item-recent",
        origin: "product-provisioning:reactivate",
      }),
      expect.any(String)
    );
  });

  it.each([ProductKind.WATER, ProductKind.BOTTLE, ProductKind.OTHER])(
    "cria item SELLABLE_PRODUCT quando nao existe nenhum (kind=%s)",
    async (kind) => {
      mocks.repository.findInventoryItemsByProductId.mockResolvedValue([]);
      const created = item();
      mocks.repository.createInventoryItem.mockResolvedValue(created);

      const result = await inventoryItemProvisioningService.provisionForProduct(
        product({ kind }),
        tx
      );

      expect(result).toEqual({ item: created, created: true });
      expect(mocks.repository.createInventoryItem).toHaveBeenCalledWith(
        {
          code: "AGUA20LPREMIUM-3f9a2b1c",
          name: "Água 20L Premium",
          type: InventoryItemType.SELLABLE_PRODUCT,
          product_id: productId,
          unit_label: "un",
          low_stock_threshold: 10,
        },
        tx
      );
      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: productId,
          origin: "product-provisioning:create",
        }),
        expect.any(String)
      );
    }
  );

  it("pre-checa o code de 8 chars e cria com ele quando esta livre", async () => {
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([]);
    const created = item();
    mocks.repository.createInventoryItem.mockResolvedValue(created);

    await inventoryItemProvisioningService.provisionForProduct(product(), tx);

    expect(mocks.repository.findInventoryItemByCode).toHaveBeenCalledWith(
      "AGUA20LPREMIUM-3f9a2b1c",
      tx
    );
    expect(mocks.repository.createInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AGUA20LPREMIUM-3f9a2b1c" }),
      tx
    );
  });

  it("usa fragmento de 12 chars quando o code de 8 ja pertence a outro item (pre-checagem)", async () => {
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([]);
    mocks.repository.findInventoryItemByCode.mockResolvedValue(
      item({ id: "item-de-outro-produto", product_id: "outro-produto" })
    );
    const created = item({ code: "AGUA20LPREMIUM-3f9a2b1c1111" });
    mocks.repository.createInventoryItem.mockResolvedValue(created);

    const result = await inventoryItemProvisioningService.provisionForProduct(product(), tx);

    expect(result).toEqual({ item: created, created: true });
    expect(mocks.repository.createInventoryItem).toHaveBeenCalledTimes(1);
    expect(mocks.repository.createInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AGUA20LPREMIUM-3f9a2b1c1111" }),
      tx
    );
  });

  it("propaga P2002 residual do create SEM retry (a transacao ja estaria abortada)", async () => {
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([]);
    mocks.repository.createInventoryItem.mockRejectedValue(uniqueViolation());

    await expect(
      inventoryItemProvisioningService.provisionForProduct(product(), tx)
    ).rejects.toMatchObject({ code: "P2002" });
    expect(mocks.repository.createInventoryItem).toHaveBeenCalledTimes(1);
  });

  it("propaga erro generico do create", async () => {
    mocks.repository.findInventoryItemsByProductId.mockResolvedValue([]);
    mocks.repository.createInventoryItem.mockRejectedValue(new Error("db down"));

    await expect(
      inventoryItemProvisioningService.provisionForProduct(product(), tx)
    ).rejects.toThrow("db down");
    expect(mocks.repository.createInventoryItem).toHaveBeenCalledTimes(1);
  });
});
