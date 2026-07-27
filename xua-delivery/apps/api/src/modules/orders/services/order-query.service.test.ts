import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  orderRepository: {
    findByDistributorPaged: vi.fn(),
  },
  distributorRepository: {
    resolveDistributorId: vi.fn(),
  },
  auditRepository: {
    findByOrder: vi.fn(),
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => ({
    consumer: { findMany: vi.fn(async () => []) },
  }),
}));

vi.mock("../../../infra/redis/client.js", () => ({
  default: { get: vi.fn() },
}));

vi.mock("../repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));

vi.mock("../../distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

vi.mock("../../audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

const { orderQueryService } = await import("./order-query.service.js");

const userId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236902";

function emptyPagedResult() {
  return { orders: [], total: 0, statusCounts: {} };
}

describe("orderQueryService.listDistributorQueue — aba Histórico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.orderRepository.findByDistributorPaged.mockResolvedValue(emptyPagedResult());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aplica janela padrão de 30 dias quando stage=history sem filtro de data", async () => {
    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "history",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(mocks.orderRepository.findByDistributorPaged).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        statuses: expect.arrayContaining([
          OrderStatus.DELIVERED,
          OrderStatus.CANCELLED,
          OrderStatus.REJECTED_BY_DISTRIBUTOR,
          OrderStatus.DELIVERY_FAILED,
        ]),
        deliveryDate: undefined,
        start: "2026-05-13",
        end: "2026-06-12",
      })
    );
  });

  it("respeita deliveryDate explícito do usuário sem sobrescrever com a janela padrão", async () => {
    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "history",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
      deliveryDate: "2026-06-01",
    });

    expect(mocks.orderRepository.findByDistributorPaged).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        deliveryDate: "2026-06-01",
        start: undefined,
        end: undefined,
      })
    );
  });

  it("respeita start/end explícitos do usuário sem sobrescrever com a janela padrão", async () => {
    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "all",
      status: OrderStatus.DELIVERED,
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
      start: "2026-01-01",
      end: "2026-01-15",
    });

    expect(mocks.orderRepository.findByDistributorPaged).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        statuses: [OrderStatus.DELIVERED],
        start: "2026-01-01",
        end: "2026-01-15",
      })
    );
  });

  it("não aplica janela padrão para stages ativos (incoming/preparation/route/all)", async () => {
    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "incoming",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(mocks.orderRepository.findByDistributorPaged).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        deliveryDate: undefined,
        start: undefined,
        end: undefined,
      })
    );
  });

  it("mantém summaryStatuses como os status ativos, independente do stage pedido", async () => {
    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "history",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(mocks.orderRepository.findByDistributorPaged).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        summaryStatuses: [
          OrderStatus.SENT_TO_DISTRIBUTOR,
          OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
          OrderStatus.READY_FOR_DISPATCH,
          OrderStatus.OUT_FOR_DELIVERY,
        ],
      })
    );
  });
});
