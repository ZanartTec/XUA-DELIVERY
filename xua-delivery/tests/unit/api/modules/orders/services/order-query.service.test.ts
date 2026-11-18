import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  prisma: {
    consumer: { findMany: vi.fn(async () => [] as Array<{ id: string; name: string }>) },
    distributor: { findUnique: vi.fn(async () => ({ acceptance_sla_seconds: 180 })) },
  },
  orderRepository: {
    findByDistributorPaged: vi.fn(),
    findDistributorBoard: vi.fn(),
    countDistributorQueue: vi.fn(),
  },
  distributorRepository: {
    resolveDistributorId: vi.fn(),
  },
  auditRepository: {
    findByOrder: vi.fn(),
  },
}));

vi.mock("@api/infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("@api/infra/redis/client.js", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@api/modules/orders/repository/orders.repository.js", () => ({
  orderRepository: mocks.orderRepository,
}));

vi.mock("@api/modules/distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

vi.mock("@api/modules/audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

const { orderQueryService } = await import("@api/modules/orders/services/order-query.service.js");

const userId = "7e1d7b55-3f52-4d10-aac3-74387c236901";
const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236902";

function emptyPagedResult(overdueActive = 0) {
  return { orders: [], total: 0, statusCounts: {}, overdueActive };
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
          OrderStatus.REDELIVERY_SCHEDULED,
          OrderStatus.OUT_FOR_DELIVERY,
        ],
      })
    );
  });

  it("a etapa Preparo inclui a reentrega agendada (sem isso o pedido sumia da fila)", async () => {
    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "preparation",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(mocks.orderRepository.findByDistributorPaged).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        statuses: [
          OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
          OrderStatus.READY_FOR_DISPATCH,
          OrderStatus.REDELIVERY_SCHEDULED,
        ],
      })
    );
  });

  it("repassa overdueActive do repositório como summary.overdue", async () => {
    mocks.orderRepository.findByDistributorPaged.mockResolvedValue(emptyPagedResult(4));

    const result = await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "all",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(result.summary.overdue).toBe(4);
  });
});

describe("acceptanceDeadline (D-05)", () => {
  it("usa o SLA da distribuidora a partir da entrada na fila", async () => {
    const { acceptanceDeadline } = await import("@api/modules/orders/services/order-query.service.js");
    const deadline = acceptanceDeadline(
      { status: OrderStatus.SENT_TO_DISTRIBUTOR, created_at: "2026-11-05T10:00:00.000Z", updated_at: "2026-11-05T10:04:00.000Z" },
      180,
    );
    // Pedido pago online entrou na fila 4 min depois de criado: o prazo conta dali.
    expect(deadline).toBe("2026-11-05T10:07:00.000Z");
  });

  it("não há prazo fora da etapa de aceite", async () => {
    const { acceptanceDeadline } = await import("@api/modules/orders/services/order-query.service.js");
    expect(
      acceptanceDeadline({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR, created_at: "2026-11-05T10:00:00.000Z", updated_at: "2026-11-05T10:01:00.000Z" }, 180),
    ).toBeNull();
  });
});

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    status: OrderStatus.SENT_TO_DISTRIBUTOR,
    driver_id: null,
    total_cents: 4800,
    delivery_date: new Date("2026-06-12T00:00:00.000Z"),
    delivery_window: "AFTERNOON",
    scheduled_time_label: null,
    scheduled_time_start_hour: null,
    scheduled_time_start_minute: null,
    scheduled_time_end_hour: null,
    scheduled_time_end_minute: null,
    created_at: new Date("2026-06-12T10:00:00.000Z"),
    updated_at: new Date("2026-06-12T10:00:00.000Z"),
    consumer: { name: "Maria" },
    address: { street: "Rua A", number: "10", neighborhood: "Centro" },
    items: [{ quantity: 2, product_name: "Galão 20L" }],
    subscription_delivery_date: null,
    ...overrides,
  };
}

describe("orderQueryService.listDistributorQueue — apresentação enxuta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
  });

  it("marca a origem pela existência da assinatura e não vaza contexto de assinatura nem colunas internas", async () => {
    mocks.orderRepository.findByDistributorPaged.mockResolvedValue({
      orders: [queueRow({ subscription_delivery_date: { id: "sub-1" } })],
      total: 1,
      statusCounts: { [OrderStatus.SENT_TO_DISTRIBUTOR]: 1 },
      overdueActive: 0,
    });

    const result = await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "incoming",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    const [order] = result.orders;
    expect(order.order_origin).toBe("subscription");
    expect(order.consumer_name).toBe("Maria");
    expect(order.address_summary).toBe("Rua A, 10 - Centro");
    expect(order.item_summary).toBe("2x Galão 20L");
    expect(order).not.toHaveProperty("consumer");
    expect(order).not.toHaveProperty("items");
    expect(order).not.toHaveProperty("subscription_delivery_date");
    expect(order).not.toHaveProperty("subscription_plan_name");
  });

  it("resolve o nome do motorista numa consulta só para a página e calcula o prazo de aceite", async () => {
    mocks.orderRepository.findByDistributorPaged.mockResolvedValue({
      orders: [
        queueRow({ id: "a", driver_id: "drv-1" }),
        queueRow({ id: "b", driver_id: "drv-1" }),
        queueRow({ id: "c", driver_id: null }),
      ],
      total: 3,
      statusCounts: {},
      overdueActive: 0,
    });
    mocks.prisma.consumer.findMany.mockResolvedValueOnce([{ id: "drv-1", name: "Carlos" }]);

    const result = await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "all",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["drv-1"] } } })
    );
    expect(result.orders.map((o) => o.driver_name)).toEqual(["Carlos", "Carlos", null]);
    // SLA de 180 s a partir da entrada na fila (pedido novo).
    expect(result.orders[0].sla_deadline).toBe("2026-06-12T10:03:00.000Z");
  });

  it("não consulta motoristas quando nenhum pedido tem motorista", async () => {
    mocks.orderRepository.findByDistributorPaged.mockResolvedValue({
      orders: [queueRow()],
      total: 1,
      statusCounts: {},
      overdueActive: 0,
    });

    await orderQueryService.listDistributorQueue(userId, "distributor_admin", {
      scope: "distributor",
      stage: "all",
      origin: "all",
      sort: "created_desc",
      page: 1,
      limit: 20,
    });

    expect(mocks.prisma.consumer.findMany).not.toHaveBeenCalled();
  });
});

describe("orderQueryService.listDistributorBoard", () => {
  const boardQuery = {
    scope: "distributor" as const,
    view: "board" as const,
    origin: "all" as const,
    sort: "created_desc" as const,
    perColumn: 12,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
  });

  it("pede ao banco as três etapas e devolve cada coluna com seus pedidos e total", async () => {
    mocks.orderRepository.findDistributorBoard.mockResolvedValue({
      columns: {
        incoming: { orders: [queueRow({ id: "n1" })], total: 31 },
        preparation: { orders: [queueRow({ id: "p1", status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR })], total: 62 },
        route: { orders: [], total: 0 },
      },
      statusCounts: {
        [OrderStatus.SENT_TO_DISTRIBUTOR]: 31,
        [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: 40,
        [OrderStatus.READY_FOR_DISPATCH]: 22,
      },
      overdueActive: 4,
    });

    const result = await orderQueryService.listDistributorBoard(userId, "distributor_admin", boardQuery);

    expect(mocks.orderRepository.findDistributorBoard).toHaveBeenCalledWith(
      distributorId,
      expect.objectContaining({
        perColumn: 12,
        columns: {
          incoming: [OrderStatus.SENT_TO_DISTRIBUTOR],
          preparation: [
            OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
            OrderStatus.READY_FOR_DISPATCH,
            OrderStatus.REDELIVERY_SCHEDULED,
          ],
          route: [OrderStatus.OUT_FOR_DELIVERY],
        },
      })
    );
    expect(result.columns.incoming.total).toBe(31);
    expect(result.columns.incoming.orders[0].id).toBe("n1");
    expect(result.columns.preparation.total).toBe(62);
    expect(result.columns.route.orders).toEqual([]);
    expect(result.summary).toEqual({ active: 93, incoming: 31, preparation: 62, route: 0, overdue: 4 });
    expect(result.perColumn).toBe(12);
  });

  it("busca o nome dos motoristas de todas as colunas de uma vez", async () => {
    mocks.orderRepository.findDistributorBoard.mockResolvedValue({
      columns: {
        incoming: { orders: [], total: 0 },
        preparation: { orders: [queueRow({ id: "p1", driver_id: "drv-1" })], total: 1 },
        route: { orders: [queueRow({ id: "r1", driver_id: "drv-2" })], total: 1 },
      },
      statusCounts: {},
      overdueActive: 0,
    });
    mocks.prisma.consumer.findMany.mockResolvedValueOnce([
      { id: "drv-1", name: "Carlos" },
      { id: "drv-2", name: "Ana" },
    ]);

    const result = await orderQueryService.listDistributorBoard(userId, "distributor_admin", boardQuery);

    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledTimes(1);
    expect(result.columns.preparation.orders[0].driver_name).toBe("Carlos");
    expect(result.columns.route.orders[0].driver_name).toBe("Ana");
  });

  it("nega acesso a quem não é admin de distribuidora", async () => {
    await expect(orderQueryService.listDistributorBoard(userId, "consumer", boardQuery)).rejects.toThrow(
      "Acesso negado"
    );
    expect(mocks.orderRepository.findDistributorBoard).not.toHaveBeenCalled();
  });
});

describe("orderQueryService.getDistributorQueueSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
  });

  it("conta a reentrega agendada em Preparo e no total de ativos", async () => {
    mocks.orderRepository.countDistributorQueue.mockResolvedValue({
      statusCounts: {
        [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: 2,
        [OrderStatus.READY_FOR_DISPATCH]: 1,
        [OrderStatus.REDELIVERY_SCHEDULED]: 4,
      },
      overdueActive: 0,
    });

    const summary = await orderQueryService.getDistributorQueueSummary(userId, "distributor_admin");

    expect(summary).toEqual({ active: 7, incoming: 0, preparation: 7, route: 0, overdue: 0 });
  });

  it("devolve só os contadores, sem listar pedidos", async () => {
    mocks.orderRepository.countDistributorQueue.mockResolvedValue({
      statusCounts: {
        [OrderStatus.SENT_TO_DISTRIBUTOR]: 3,
        [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: 2,
        [OrderStatus.OUT_FOR_DELIVERY]: 1,
      },
      overdueActive: 1,
    });

    const summary = await orderQueryService.getDistributorQueueSummary(userId, "distributor_admin");

    expect(summary).toEqual({ active: 6, incoming: 3, preparation: 2, route: 1, overdue: 1 });
    expect(mocks.orderRepository.findByDistributorPaged).not.toHaveBeenCalled();
  });

  it("nega acesso a quem não é admin de distribuidora", async () => {
    await expect(orderQueryService.getDistributorQueueSummary(userId, "driver")).rejects.toThrow("Acesso negado");
  });
});

describe("orderQueryService.listDistributorQueue — janela do histórico no fuso de Brasília", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.distributorRepository.resolveDistributorId.mockResolvedValue(distributorId);
    mocks.orderRepository.findByDistributorPaged.mockResolvedValue(emptyPagedResult());
    vi.useFakeTimers();
    // 12/06/2026 21:30 em Brasília = 13/06/2026 00:30 UTC
    vi.setSystemTime(new Date("2026-06-13T00:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a janela de 30 dias termina em hoje de Brasília, não no dia seguinte em UTC", async () => {
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
      expect.objectContaining({ start: "2026-05-13", end: "2026-06-12" })
    );
  });
});
