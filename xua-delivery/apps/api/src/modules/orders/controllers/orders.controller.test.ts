import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { OrderStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => {
  class MockOrderServiceError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "OrderServiceError";
    }
  }

  return {
    OrderServiceError: MockOrderServiceError,
    orderService: {
      createOrder: vi.fn(),
      acceptOrder: vi.fn(),
      rejectOrder: vi.fn(),
      completeChecklist: vi.fn(),
      dispatch: vi.fn(),
      dispatchWithChecklist: vi.fn(),
      deliverOrder: vi.fn(),
      cancelOrder: vi.fn(),
      markDeliveryFailed: vi.fn(),
      scheduleRedelivery: vi.fn(),
    },
    orderRepository: { findById: vi.fn() },
    orderPolicy: { canAccess: vi.fn() },
    distributorService: { resolveDistributor: vi.fn() },
    prisma: {
      address: { findFirst: vi.fn() },
      zone: { findFirst: vi.fn() },
      product: { findMany: vi.fn() },
    },
    otpService: { generate: vi.fn(), validate: vi.fn(), override: vi.fn() },
    socketEmit: vi.fn(),
    socketTo: vi.fn(),
    loggerError: vi.fn(),
  };
});

vi.mock("../services/orders.service.js", () => ({
  orderService: mocks.orderService,
  OrderServiceError: mocks.OrderServiceError,
}));

vi.mock("../policies/order.policy.js", () => ({
  orderPolicy: mocks.orderPolicy,
}));

vi.mock("../repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));

vi.mock("../../driver/services/otp.service.js", () => ({
  otpService: mocks.otpService,
}));

vi.mock("../../../infra/socket/gateway.js", () => ({
  getIO: () => ({ to: mocks.socketTo }),
}));

vi.mock("../../../infra/logger/index.js", () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("../../distributor/index.js", () => ({
  distributorService: mocks.distributorService,
  DistributorServiceError: class DistributorServiceError extends Error {},
}));

const { ordersController } = await import("./orders.controller.js");

const orderId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const userId = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const addressId = "7e1d7b55-3f52-4d10-aac3-74387c236904";
const zoneId = "7e1d7b55-3f52-4d10-aac3-74387c236905";
const productId = "7e1d7b55-3f52-4d10-aac3-74387c236906";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236903";
const existingOrder = {
  id: orderId,
  consumer_id: userId,
  distributor_id: distributorId,
  driver_id: userId,
  status: OrderStatus.SENT_TO_DISTRIBUTOR,
};

function req(role: string, body: Record<string, unknown>): Request {
  return {
    user: { sub: userId, role },
    params: { id: orderId },
    body,
  } as unknown as Request;
}

function res() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };

  response.status.mockReturnValue(response);
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socketTo.mockReturnValue({ emit: mocks.socketEmit });
  mocks.orderRepository.findById.mockResolvedValue(existingOrder);
  mocks.orderPolicy.canAccess.mockResolvedValue(true);
  mocks.prisma.address.findFirst.mockResolvedValue({ id: addressId, zone_id: zoneId });
  mocks.prisma.zone.findFirst.mockResolvedValue({ id: zoneId, is_active: true });
  mocks.prisma.product.findMany.mockResolvedValue([
    { id: productId, name: "Garrafão 20L", price_cents: 2500, is_active: true },
  ]);
  mocks.distributorService.resolveDistributor.mockResolvedValue({
    distributorId,
    zoneId,
    mode: "auto",
  });
  mocks.orderService.createOrder.mockResolvedValue({
    ...existingOrder,
    total_cents: 2500,
    status: OrderStatus.SENT_TO_DISTRIBUTOR,
  });
  mocks.orderService.acceptOrder.mockResolvedValue({ ...existingOrder, status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR });
  mocks.orderService.cancelOrder.mockResolvedValue({ ...existingOrder, status: OrderStatus.CANCELLED });
  mocks.orderService.markDeliveryFailed.mockResolvedValue({ ...existingOrder, status: OrderStatus.DELIVERY_FAILED });
});

describe("ordersController create", () => {
  it("cria pedido em dinheiro com troco", async () => {
    const response = res();

    await ordersController.create(
      req("consumer", {
        address_id: addressId,
        delivery_date: "2026-06-12",
        delivery_window: "morning",
        payment_method: "cash",
        cash_change_for_cents: 10000,
        items: [{ product_id: productId, quantity: 1 }],
      }),
      response
    );

    expect(mocks.orderService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerId: userId,
        addressId,
        distributorId,
        zoneId,
        deliveryWindow: "MORNING",
        paymentMethod: "cash",
        cashChangeForCents: 10000,
      })
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });
});

describe("ordersController action RBAC", () => {
  it("bloqueia consumer em aceite de distribuidora", async () => {
    const response = res();

    await ordersController.action(req("consumer", { action: "accept" }), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.orderService.acceptOrder).not.toHaveBeenCalled();
  });

  it("permite distributor_admin aceitar pedido", async () => {
    const response = res();

    await ordersController.action(req("distributor_admin", { action: "accept" }), response);

    expect(mocks.orderService.acceptOrder).toHaveBeenCalledWith(orderId, userId);
    expect(response.json).toHaveBeenCalledWith({
      order: expect.objectContaining({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR }),
    });
  });

  it("bloqueia support em cancelamento que pode afetar estoque", async () => {
    const response = res();

    await ordersController.action(req("support", { action: "cancel", reason: "Suporte" }), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.orderService.cancelOrder).not.toHaveBeenCalled();
  });

  it("permite OPS cancelar sem tratar support como ator de estoque", async () => {
    const response = res();

    await ordersController.action(
      req("ops", { action: "cancel", reason: "Operacao", return_to_stock: true }),
      response
    );

    expect(mocks.orderService.cancelOrder).toHaveBeenCalledWith(orderId, userId, "ops", "Operacao", {
      returnToStock: true,
    });
  });

  it("bloqueia OPS em falha de entrega e permite driver com retorno fisico", async () => {
    const opsResponse = res();
    const driverResponse = res();

    await ordersController.action(req("ops", { action: "delivery_failed", reason: "Ausente" }), opsResponse);
    await ordersController.action(
      req("driver", {
        action: "delivery_failed",
        reason: "Ausente",
        physical_return_confirmed: true,
      }),
      driverResponse
    );

    expect(opsResponse.status).toHaveBeenCalledWith(403);
    expect(mocks.orderService.markDeliveryFailed).toHaveBeenCalledWith(orderId, userId, "Ausente", {
      returnToStock: true,
    });
  });
});

describe("ordersController inventory errors", () => {
  it("retorna 409 para STOCK_UNAVAILABLE", async () => {
    const response = res();
    mocks.orderService.acceptOrder.mockRejectedValueOnce(
      new mocks.OrderServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente")
    );

    await ordersController.action(req("distributor_admin", { action: "accept" }), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: "Saldo insuficiente",
      code: "STOCK_UNAVAILABLE",
    });
  });

  it("retorna 409 para IDEMPOTENCY_CONFLICT", async () => {
    const response = res();
    mocks.orderService.acceptOrder.mockRejectedValueOnce(
      new mocks.OrderServiceError("IDEMPOTENCY_CONFLICT", "Referencia de estoque divergente")
    );

    await ordersController.action(req("distributor_admin", { action: "accept" }), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: "Referencia de estoque divergente",
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
});