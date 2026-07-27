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

  class MockOtpServiceError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "OtpServiceError";
    }
  }

  return {
    OrderServiceError: MockOrderServiceError,
    OtpServiceError: MockOtpServiceError,
    orderService: {
      listOrders: vi.fn(),
      searchOrders: vi.fn(),
      listDistributorQueue: vi.fn(),
      createOrder: vi.fn(),
      acceptOrder: vi.fn(),
      rejectOrder: vi.fn(),
      assignDriver: vi.fn(),
      completeChecklist: vi.fn(),
      dispatch: vi.fn(),
      dispatchWithChecklist: vi.fn(),
      deliverOrder: vi.fn(),
      cancelOrder: vi.fn(),
      markDeliveryFailed: vi.fn(),
      scheduleRedelivery: vi.fn(),
      getOrderDetail: vi.fn(),
      submitRating: vi.fn(),
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
  OtpServiceError: mocks.OtpServiceError,
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

function req(role: string, body: Record<string, unknown>, query: Record<string, unknown> = {}): Request {
  return {
    user: { sub: userId, role },
    params: { id: orderId },
    query,
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
  mocks.orderService.listDistributorQueue.mockResolvedValue({
    orders: [],
    total: 0,
    page: 1,
    totalPages: 0,
    limit: 20,
    summary: { active: 0, incoming: 0, preparation: 0, route: 0 },
    filters: {
      stage: "all",
      status: null,
      q: null,
      origin: "all",
      deliveryDate: null,
      start: null,
      end: null,
      driverId: null,
      sort: "created_desc",
    },
  });
  mocks.orderService.createOrder.mockResolvedValue({
    ...existingOrder,
    total_cents: 2500,
    status: OrderStatus.SENT_TO_DISTRIBUTOR,
  });
  mocks.orderService.acceptOrder.mockResolvedValue({ ...existingOrder, status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR });
  mocks.orderService.rejectOrder.mockResolvedValue({ ...existingOrder, status: OrderStatus.REJECTED_BY_DISTRIBUTOR });
  mocks.orderService.assignDriver.mockResolvedValue({ ...existingOrder, driver_id: userId });
  mocks.orderService.completeChecklist.mockResolvedValue({ ...existingOrder, status: OrderStatus.READY_FOR_DISPATCH });
  mocks.orderService.dispatch.mockResolvedValue({
    order: { ...existingOrder, status: OrderStatus.OUT_FOR_DELIVERY },
    otpCode: "654321",
  });
  mocks.orderService.dispatchWithChecklist.mockResolvedValue({
    order: { ...existingOrder, status: OrderStatus.OUT_FOR_DELIVERY },
    otpCode: "654321",
  });
  mocks.orderService.deliverOrder.mockResolvedValue({ ...existingOrder, status: OrderStatus.DELIVERED });
  mocks.orderService.cancelOrder.mockResolvedValue({ ...existingOrder, status: OrderStatus.CANCELLED });
  mocks.orderService.markDeliveryFailed.mockResolvedValue({ ...existingOrder, status: OrderStatus.DELIVERY_FAILED });
  mocks.orderService.scheduleRedelivery.mockResolvedValue({ ...existingOrder, status: OrderStatus.REDELIVERY_SCHEDULED });
});

describe("ordersController list distributor queue", () => {
  it("bloqueia consumer em scope distributor", async () => {
    const response = res();

    await ordersController.list(req("consumer", {}, { scope: "distributor" }), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.orderService.listDistributorQueue).not.toHaveBeenCalled();
  });

  it("retorna 400 para query inválida", async () => {
    const response = res();

    await ordersController.list(req("distributor_admin", {}, { scope: "distributor", q: "a" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: expect.any(String),
      code: "INVALID_QUERY",
    });
    expect(mocks.orderService.listDistributorQueue).not.toHaveBeenCalled();
  });

  it("retorna envelope paginado e chama service com query validada", async () => {
    const response = res();
    const result = {
      orders: [{ id: orderId, status: OrderStatus.SENT_TO_DISTRIBUTOR }],
      total: 1,
      page: 2,
      totalPages: 3,
      limit: 20,
      summary: { active: 8, incoming: 2, preparation: 4, route: 2 },
      filters: {
        stage: "incoming",
        status: null,
        q: "Maria",
        origin: "cart",
        deliveryDate: null,
        start: null,
        end: null,
        driverId: "unassigned",
        sort: "sla_asc",
      },
    };
    mocks.orderService.listDistributorQueue.mockResolvedValueOnce(result);

    await ordersController.list(
      req("distributor_admin", {}, {
        scope: "distributor",
        stage: "incoming",
        q: " Maria ",
        origin: "cart",
        driverId: "unassigned",
        sort: "sla_asc",
        page: "2",
        limit: "20",
      }),
      response
    );

    expect(mocks.orderService.listDistributorQueue).toHaveBeenCalledWith(
      userId,
      "distributor_admin",
      expect.objectContaining({
        scope: "distributor",
        stage: "incoming",
        q: "Maria",
        origin: "cart",
        driverId: "unassigned",
        sort: "sla_asc",
        page: 2,
        limit: 20,
      })
    );
    expect(response.json).toHaveBeenCalledWith(result);
  });

  it("aceita stage history e repassa status terminal para o service", async () => {
    const response = res();
    const result = {
      orders: [{ id: orderId, status: OrderStatus.DELIVERED }],
      total: 1,
      page: 1,
      totalPages: 1,
      limit: 20,
      summary: { active: 0, incoming: 0, preparation: 0, route: 0 },
      filters: {
        stage: "history",
        status: OrderStatus.DELIVERED,
        q: null,
        origin: "all",
        deliveryDate: null,
        start: "2026-05-13",
        end: "2026-06-12",
        driverId: null,
        sort: "created_desc",
      },
    };
    mocks.orderService.listDistributorQueue.mockResolvedValueOnce(result);

    await ordersController.list(
      req("distributor_admin", {}, {
        scope: "distributor",
        stage: "history",
        status: OrderStatus.DELIVERED,
      }),
      response
    );

    expect(mocks.orderService.listDistributorQueue).toHaveBeenCalledWith(
      userId,
      "distributor_admin",
      expect.objectContaining({
        scope: "distributor",
        stage: "history",
        status: OrderStatus.DELIVERED,
      })
    );
    expect(response.json).toHaveBeenCalledWith(result);
  });
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

describe("ordersController accept/reject (ownership)", () => {
  it("retorna 404 quando o pedido nao existe", async () => {
    const response = res();
    mocks.orderRepository.findById.mockResolvedValueOnce(null);

    await ordersController.accept(req("distributor_admin", {}), response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(mocks.orderService.acceptOrder).not.toHaveBeenCalled();
  });

  it("retorna 403 quando orderPolicy.canAccess nega", async () => {
    const response = res();
    mocks.orderPolicy.canAccess.mockResolvedValueOnce(false);

    await ordersController.accept(req("distributor_admin", {}), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.orderService.acceptOrder).not.toHaveBeenCalled();
  });

  it("aceita pedido e devolve o resultado do service", async () => {
    const response = res();

    await ordersController.accept(req("distributor_admin", {}), response);

    expect(mocks.orderService.acceptOrder).toHaveBeenCalledWith(orderId, userId);
    expect(response.json).toHaveBeenCalledWith({
      order: expect.objectContaining({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR }),
    });
  });

  it("rejeita pedido com motivo validado pelo schema", async () => {
    const response = res();

    await ordersController.reject(req("distributor_admin", { reason: "out_of_stock" }), response);

    expect(mocks.orderService.rejectOrder).toHaveBeenCalledWith(orderId, userId, "out_of_stock", undefined);
  });

  it("retorna 400 quando o motivo de rejeicao e invalido", async () => {
    const response = res();

    await ordersController.reject(req("distributor_admin", { reason: "not_a_valid_reason" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.orderService.rejectOrder).not.toHaveBeenCalled();
  });
});

describe("ordersController assignDriver/completeChecklist/dispatch", () => {
  it("atribui motorista validando driver_id", async () => {
    const response = res();

    await ordersController.assignDriver(req("distributor_admin", { driver_id: userId }), response);

    expect(mocks.orderService.assignDriver).toHaveBeenCalledWith(orderId, userId, userId);
    expect(response.json).toHaveBeenCalledWith({
      order: expect.objectContaining({ driver_id: userId }),
    });
  });

  it("retorna 400 quando driver_id nao e um uuid valido", async () => {
    const response = res();

    await ordersController.assignDriver(req("distributor_admin", { driver_id: "not-a-uuid" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.orderService.assignDriver).not.toHaveBeenCalled();
  });

  it("completa checklist de despacho", async () => {
    const response = res();

    await ordersController.completeChecklist(req("distributor_admin", {}), response);

    expect(mocks.orderService.completeChecklist).toHaveBeenCalledWith(orderId, userId);
  });

  it("despacha pedido e emite OTP via socket", async () => {
    const response = res();

    await ordersController.dispatch(req("distributor_admin", { driver_id: userId }), response);

    expect(mocks.orderService.dispatch).toHaveBeenCalledWith(orderId, userId, userId);
    expect(mocks.socketTo).toHaveBeenCalledWith(`consumer:${userId}`);
    expect(mocks.socketEmit).toHaveBeenCalledWith("otp_generated", { orderId, code: "654321" });
    expect(response.json).toHaveBeenCalledWith({
      order: expect.objectContaining({ status: OrderStatus.OUT_FOR_DELIVERY }),
      otp: "654321",
    });
  });

  it("despacha com checklist atomico e emite OTP via socket", async () => {
    const response = res();

    await ordersController.dispatchWithChecklist(req("distributor_admin", { driver_id: userId }), response);

    expect(mocks.orderService.dispatchWithChecklist).toHaveBeenCalledWith(orderId, userId, userId);
    expect(mocks.socketEmit).toHaveBeenCalledWith("otp_generated", { orderId, code: "654321" });
  });
});

describe("ordersController deliver/verifyOtp/otpOverride", () => {
  it("entrega pedido diretamente (uso administrativo)", async () => {
    const response = res();

    await ordersController.deliver(req("driver", {}), response);

    expect(mocks.orderService.deliverOrder).toHaveBeenCalledWith(orderId, userId);
  });

  it("retorna 429 quando o OTP ja estava bloqueado por tentativas anteriores", async () => {
    const response = res();
    mocks.otpService.validate.mockRejectedValueOnce(
      new mocks.OtpServiceError("OTP_LOCKED", "OTP bloqueado por excesso de tentativas")
    );

    await ordersController.verifyOtp(req("driver", { code: "123456" }), response);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({
      error: "OTP bloqueado por excesso de tentativas",
      code: "OTP_LOCKED",
    });
    expect(mocks.orderService.deliverOrder).not.toHaveBeenCalled();
  });

  it("retorna 400 quando o OTP esta expirado", async () => {
    const response = res();
    mocks.otpService.validate.mockRejectedValueOnce(new mocks.OtpServiceError("OTP_EXPIRED", "OTP expirado"));

    await ordersController.verifyOtp(req("driver", { code: "123456" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: "OTP expirado", code: "OTP_EXPIRED" });
  });

  it("retorna 404 quando o OTP nao existe", async () => {
    const response = res();
    mocks.otpService.validate.mockRejectedValueOnce(new mocks.OtpServiceError("OTP_NOT_FOUND", "OTP não encontrado"));

    await ordersController.verifyOtp(req("driver", { code: "123456" }), response);

    expect(response.status).toHaveBeenCalledWith(404);
  });

  it("entrega o pedido quando o codigo informado e valido", async () => {
    const response = res();
    mocks.otpService.validate.mockResolvedValueOnce({ isValid: true, attempts: 1, maxAttempts: 5, locked: false });

    await ordersController.verifyOtp(req("driver", { code: "123456" }), response);

    expect(mocks.orderService.deliverOrder).toHaveBeenCalledWith(orderId, userId);
  });

  it("retorna 400 quando o codigo informado nao tem 6 digitos", async () => {
    const response = res();

    await ordersController.verifyOtp(req("driver", { code: "123" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.otpService.validate).not.toHaveBeenCalled();
  });

  it("faz override do OTP com motivo obrigatorio e entrega o pedido", async () => {
    const response = res();

    await ordersController.otpOverride(req("ops", { reason: "Cliente sem celular" }), response);

    expect(mocks.otpService.override).toHaveBeenCalledWith(orderId, userId, "Cliente sem celular");
    expect(mocks.orderService.deliverOrder).toHaveBeenCalledWith(orderId, userId);
  });

  it("retorna 400 quando o override nao informa motivo", async () => {
    const response = res();

    await ordersController.otpOverride(req("ops", {}), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.otpService.override).not.toHaveBeenCalled();
  });
});

describe("ordersController cancel/deliveryFailed/scheduleRedelivery", () => {
  it("cancela pedido repassando actorType conforme a role", async () => {
    const response = res();

    await ordersController.cancel(req("ops", { reason: "Operacao", return_to_stock: true }), response);

    expect(mocks.orderService.cancelOrder).toHaveBeenCalledWith(orderId, userId, "ops", "Operacao", {
      returnToStock: true,
    });
  });

  it("usa motivo padrao quando reason nao e informado no cancelamento", async () => {
    const response = res();

    await ordersController.cancel(req("consumer", {}), response);

    expect(mocks.orderService.cancelOrder).toHaveBeenCalledWith(
      orderId,
      userId,
      "consumer",
      "Cancelado pelo usuário",
      undefined
    );
  });

  it("registra falha de entrega com retorno fisico confirmado", async () => {
    const response = res();

    await ordersController.deliveryFailed(
      req("driver", { reason: "Ausente", physical_return_confirmed: true }),
      response
    );

    expect(mocks.orderService.markDeliveryFailed).toHaveBeenCalledWith(orderId, userId, "Ausente", {
      returnToStock: true,
    });
  });

  it("retorna 400 quando delivery-failed nao informa motivo", async () => {
    const response = res();

    await ordersController.deliveryFailed(req("driver", {}), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.orderService.markDeliveryFailed).not.toHaveBeenCalled();
  });

  it("agenda reentrega com nova data valida", async () => {
    const response = res();

    await ordersController.scheduleRedelivery(req("ops", { new_date: "2026-07-01" }), response);

    expect(mocks.orderService.scheduleRedelivery).toHaveBeenCalledWith(orderId, userId, new Date("2026-07-01"));
  });

  it("retorna 400 quando a nova data de reentrega e invalida", async () => {
    const response = res();

    await ordersController.scheduleRedelivery(req("ops", { new_date: "data-invalida" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.orderService.scheduleRedelivery).not.toHaveBeenCalled();
  });
});

describe("ordersController inventory errors", () => {
  it("retorna 409 para STOCK_UNAVAILABLE", async () => {
    const response = res();
    mocks.orderService.acceptOrder.mockRejectedValueOnce(
      new mocks.OrderServiceError("STOCK_UNAVAILABLE", "Saldo insuficiente")
    );

    await ordersController.accept(req("distributor_admin", {}), response);

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

    await ordersController.accept(req("distributor_admin", {}), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: "Referencia de estoque divergente",
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
});

describe("ordersController list (consumer)", () => {
  it("retorna 400 para statusGroup inválido", async () => {
    const response = res();

    await ordersController.list(req("consumer", {}, { statusGroup: "invalido" }), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.orderService.listOrders).not.toHaveBeenCalled();
  });

  it("valida e repassa statusGroup/page/limit ao service", async () => {
    const response = res();
    mocks.orderService.listOrders.mockResolvedValueOnce({
      orders: [],
      total: 0,
      page: 2,
      totalPages: 0,
      limit: 6,
      summary: { all: 0, active: 0, delivered: 0, cancelled: 0 },
    });

    await ordersController.list(
      req("consumer", {}, { statusGroup: "active", page: "2", limit: "6" }),
      response
    );

    expect(mocks.orderService.listOrders).toHaveBeenCalledWith(
      userId,
      "consumer",
      undefined,
      undefined,
      2,
      6,
      "active"
    );
  });
});

describe("ordersController getById", () => {
  it("repassa o role do usuário autenticado ao service (controla exposição do OTP)", async () => {
    const response = res();
    mocks.orderService.getOrderDetail.mockResolvedValueOnce(existingOrder);

    await ordersController.getById(req("driver", {}), response);

    expect(mocks.orderService.getOrderDetail).toHaveBeenCalledWith(orderId, "driver");
  });

  it("bloqueia acesso quando orderPolicy.canAccess nega", async () => {
    const response = res();
    mocks.orderService.getOrderDetail.mockResolvedValueOnce(existingOrder);
    mocks.orderPolicy.canAccess.mockResolvedValueOnce(false);

    await ordersController.getById(req("consumer", {}), response);

    expect(response.status).toHaveBeenCalledWith(403);
  });
});

describe("ordersController submitRating", () => {
  it("retorna 409 ALREADY_RATED quando o pedido já foi avaliado", async () => {
    const response = res();
    mocks.orderService.submitRating.mockRejectedValueOnce(
      new mocks.OrderServiceError("ALREADY_RATED", "Pedido já foi avaliado")
    );

    await ordersController.submitRating(req("consumer", { rating: 5 }), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: "Pedido já foi avaliado",
      code: "ALREADY_RATED",
    });
  });
});
