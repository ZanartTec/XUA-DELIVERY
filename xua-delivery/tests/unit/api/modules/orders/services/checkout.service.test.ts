import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "@xua/shared/schemas/order";

const mocks = vi.hoisted(() => ({
  consumerRepository: { findAddressOwnedBy: vi.fn() },
  zonesRepository: { findActiveById: vi.fn() },
  productsRepository: { findActiveByIds: vi.fn() },
  distributorService: { resolveDistributor: vi.fn() },
  createOrderService: { createOrder: vi.fn() },
}));

vi.mock("@api/modules/consumers/repository/consumers.repository.js", () => ({
  consumerRepository: mocks.consumerRepository,
}));
vi.mock("@api/modules/zones/repository/zones.repository.js", () => ({
  zonesRepository: mocks.zonesRepository,
}));
vi.mock("@api/modules/products/repository/products.repository.js", () => ({
  productsRepository: mocks.productsRepository,
}));
vi.mock("@api/modules/distributor/services/distributor.service.js", () => ({
  distributorService: mocks.distributorService,
}));
vi.mock("@api/modules/orders/services/create-order.service.js", () => ({
  createOrderService: mocks.createOrderService,
}));

const { checkoutService } = await import("@api/modules/orders/services/checkout.service.js");

const CONSUMER_ID = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const ADDRESS_ID = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const ZONE_ID = "7e1d7b55-3f52-4d10-aac3-74387c236903";
const DISTRIBUTOR_ID = "7e1d7b55-3f52-4d10-aac3-74387c236904";
const PRODUCT_ID = "7e1d7b55-3f52-4d10-aac3-74387c236905";

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    address_id: ADDRESS_ID,
    delivery_date: "2026-06-12",
    delivery_window: "morning",
    items: [{ product_id: PRODUCT_ID, quantity: 2 }],
    ...overrides,
  } as CreateOrderInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumerRepository.findAddressOwnedBy.mockResolvedValue({
    id: ADDRESS_ID,
    zone_id: ZONE_ID,
  });
  mocks.zonesRepository.findActiveById.mockResolvedValue({ id: ZONE_ID, is_active: true });
  mocks.productsRepository.findActiveByIds.mockResolvedValue([
    { id: PRODUCT_ID, name: "Garrafão 20L", price_cents: 2500 },
  ]);
  mocks.distributorService.resolveDistributor.mockResolvedValue({
    distributorId: DISTRIBUTOR_ID,
    zoneId: ZONE_ID,
    mode: "auto",
  });
  mocks.createOrderService.createOrder.mockResolvedValue({ id: "order-1" });
});

describe("checkoutService.createOrderFromCheckout", () => {
  it("resolve endereço, zona, preço e distribuidora antes de criar o pedido", async () => {
    await checkoutService.createOrderFromCheckout(CONSUMER_ID, input());

    expect(mocks.createOrderService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerId: CONSUMER_ID,
        addressId: ADDRESS_ID,
        distributorId: DISTRIBUTOR_ID,
        zoneId: ZONE_ID,
        deliveryWindow: "MORNING",
        items: [
          {
            product_id: PRODUCT_ID,
            product_name: "Garrafão 20L",
            unit_price_cents: 2500,
            quantity: 2,
          },
        ],
      })
    );
  });

  it("casa cada item com seu produto mesmo quando o banco devolve em outra ordem", async () => {
    const outroProduto = "7e1d7b55-3f52-4d10-aac3-74387c236906";
    mocks.productsRepository.findActiveByIds.mockResolvedValue([
      { id: outroProduto, name: "Garrafão 10L", price_cents: 1500 },
      { id: PRODUCT_ID, name: "Garrafão 20L", price_cents: 2500 },
    ]);

    await checkoutService.createOrderFromCheckout(
      CONSUMER_ID,
      input({
        items: [
          { product_id: PRODUCT_ID, quantity: 2 },
          { product_id: outroProduto, quantity: 1 },
        ],
      })
    );

    const [[payload]] = mocks.createOrderService.createOrder.mock.calls;
    // Preço e nome vêm sempre do registro do produto, nunca do payload.
    expect(payload.items).toEqual([
      { product_id: PRODUCT_ID, product_name: "Garrafão 20L", unit_price_cents: 2500, quantity: 2 },
      { product_id: outroProduto, product_name: "Garrafão 10L", unit_price_cents: 1500, quantity: 1 },
    ]);
  });

  it("só aceita endereço do próprio consumidor", async () => {
    mocks.consumerRepository.findAddressOwnedBy.mockResolvedValue(null);

    await expect(
      checkoutService.createOrderFromCheckout(CONSUMER_ID, input())
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(mocks.consumerRepository.findAddressOwnedBy).toHaveBeenCalledWith(
      ADDRESS_ID,
      CONSUMER_ID
    );
    expect(mocks.createOrderService.createOrder).not.toHaveBeenCalled();
  });

  it("recusa endereço sem zona configurada", async () => {
    mocks.consumerRepository.findAddressOwnedBy.mockResolvedValue({
      id: ADDRESS_ID,
      zone_id: null,
    });

    await expect(
      checkoutService.createOrderFromCheckout(CONSUMER_ID, input())
    ).rejects.toMatchObject({ status: 400 });
  });

  it("recusa zona inativa", async () => {
    mocks.zonesRepository.findActiveById.mockResolvedValue(null);

    await expect(
      checkoutService.createOrderFromCheckout(CONSUMER_ID, input())
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.createOrderService.createOrder).not.toHaveBeenCalled();
  });

  it("recusa o pedido inteiro se algum produto estiver inativo ou não existir", async () => {
    mocks.productsRepository.findActiveByIds.mockResolvedValue([]);

    await expect(
      checkoutService.createOrderFromCheckout(CONSUMER_ID, input())
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.createOrderService.createOrder).not.toHaveBeenCalled();
  });

  it("repassa a distribuidora escolhida manualmente para a resolução", async () => {
    await checkoutService.createOrderFromCheckout(
      CONSUMER_ID,
      input({ distributor_id: DISTRIBUTOR_ID })
    );

    expect(mocks.distributorService.resolveDistributor).toHaveBeenCalledWith(
      CONSUMER_ID,
      ZONE_ID,
      "2026-06-12",
      "morning",
      DISTRIBUTOR_ID
    );
  });

  it("usa a zona devolvida pela resolução, não a do endereço", async () => {
    const zonaDaDistribuidora = "7e1d7b55-3f52-4d10-aac3-74387c236999";
    mocks.distributorService.resolveDistributor.mockResolvedValue({
      distributorId: DISTRIBUTOR_ID,
      zoneId: zonaDaDistribuidora,
      mode: "manual",
    });

    await checkoutService.createOrderFromCheckout(CONSUMER_ID, input());

    expect(mocks.createOrderService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: zonaDaDistribuidora, distributorSelectionMode: "manual" })
    );
  });
});
