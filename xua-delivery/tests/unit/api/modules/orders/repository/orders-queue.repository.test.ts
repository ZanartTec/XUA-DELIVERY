import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@xua/shared/enums";

const prisma = vi.hoisted(() => ({
  order: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("@api/infra/prisma/client.js", () => ({ getPrisma: () => prisma }));

const { orderRepository } = await import("@api/modules/orders/repository/orders.repository.js");

const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236902";
const ACTIVE = [
  OrderStatus.SENT_TO_DISTRIBUTOR,
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
];

function groupRows(counts: Partial<Record<OrderStatus, number>>) {
  return Object.entries(counts).map(([status, count]) => ({ status, _count: { id: count } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.order.findMany.mockResolvedValue([]);
  prisma.order.count.mockResolvedValue(0);
  prisma.order.groupBy.mockResolvedValue([]);
});

describe("orderRepository.findByDistributorPaged", () => {
  const base = { summaryStatuses: ACTIVE, page: 2, limit: 30, sort: "created_desc" as const };

  it("pagina no banco (skip/take) e usa select enxuto, sem include de assinatura", async () => {
    await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      statuses: [OrderStatus.SENT_TO_DISTRIBUTOR],
    });

    const args = prisma.order.findMany.mock.calls[0][0];
    expect(args.skip).toBe(30);
    expect(args.take).toBe(30);
    expect(args).not.toHaveProperty("include");
    expect(args.select.id).toBe(true);
    // A assinatura entra só como { id }: nada de delivery_dates de cada assinatura.
    expect(args.select.subscription_delivery_date).toEqual({ select: { id: true } });
    // Colunas pesadas/sensíveis do pedido não vão para a fila.
    expect(args.select).not.toHaveProperty("delivery_instructions");
    expect(args.select).not.toHaveProperty("nps_comment");
  });

  it("etapa ativa: o total sai do groupBy, sem count extra de listagem", async () => {
    prisma.order.groupBy.mockResolvedValue(
      groupRows({
        [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: 4,
        [OrderStatus.READY_FOR_DISPATCH]: 3,
        [OrderStatus.SENT_TO_DISTRIBUTOR]: 9,
      })
    );
    prisma.order.count.mockResolvedValue(2); // só o de atrasados

    const result = await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH],
    });

    expect(result.total).toBe(7);
    expect(result.overdueActive).toBe(2);
    // Um único count: o de atrasados. O total não ganhou consulta própria.
    expect(prisma.order.count).toHaveBeenCalledTimes(1);
  });

  it("histórico (status finais): continua contando no banco, fora do resumo", async () => {
    prisma.order.count.mockResolvedValue(12);

    const result = await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      statuses: [OrderStatus.DELIVERED],
    });

    expect(result.total).toBe(12);
    expect(prisma.order.count).toHaveBeenCalledTimes(2); // listagem + atrasados
  });

  it("aplica os filtros no where (busca, origem, motorista, data)", async () => {
    await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      statuses: [OrderStatus.OUT_FOR_DELIVERY],
      q: "Maria",
      origin: "subscription",
      driverId: "unassigned",
      deliveryDate: "2026-06-01",
    });

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.distributor_id).toBe(distributorId);
    expect(where.status).toEqual({ in: [OrderStatus.OUT_FOR_DELIVERY] });
    expect(where.OR).toEqual(
      expect.arrayContaining([{ consumer: { name: { contains: "Maria", mode: "insensitive" } } }])
    );
    expect(where.subscription_delivery_date).toEqual({ isNot: null });
    expect(where.driver_id).toBeNull();
    expect(where.delivery_date.gte).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });
});

describe("orderRepository.findDistributorBoard", () => {
  const columns = {
    incoming: [OrderStatus.SENT_TO_DISTRIBUTOR],
    preparation: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH],
    route: [OrderStatus.OUT_FOR_DELIVERY],
  };

  it("faz uma consulta por coluna limitada a perColumn e traz o total real de cada etapa", async () => {
    prisma.order.findMany.mockImplementation(async (args: { where: { status: { in: string[] } } }) =>
      args.where.status.in.map((status) => ({ id: `order-${status}` }))
    );
    prisma.order.groupBy.mockResolvedValue(
      groupRows({
        [OrderStatus.SENT_TO_DISTRIBUTOR]: 31,
        [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: 40,
        [OrderStatus.READY_FOR_DISPATCH]: 22,
        [OrderStatus.OUT_FOR_DELIVERY]: 5,
      })
    );
    prisma.order.count.mockResolvedValue(3);

    const result = await orderRepository.findDistributorBoard(distributorId, {
      columns,
      summaryStatuses: ACTIVE,
      perColumn: 12,
      sort: "created_desc",
    });

    expect(prisma.order.findMany).toHaveBeenCalledTimes(3);
    for (const [args] of prisma.order.findMany.mock.calls) {
      expect(args.take).toBe(12);
      expect(args).not.toHaveProperty("skip");
      expect(args).not.toHaveProperty("include");
    }
    // O total vem do banco inteiro, não do que coube na coluna.
    expect(result.columns.incoming.total).toBe(31);
    expect(result.columns.preparation.total).toBe(62);
    expect(result.columns.route.total).toBe(5);
    expect(result.overdueActive).toBe(3);
    // Cada coluna só recebe pedidos da própria etapa.
    expect(result.columns.preparation.orders.map((o) => o.id)).toEqual([
      `order-${OrderStatus.ACCEPTED_BY_DISTRIBUTOR}`,
      `order-${OrderStatus.READY_FOR_DISPATCH}`,
    ]);
  });

  it("repassa os mesmos filtros a todas as colunas e ao resumo", async () => {
    await orderRepository.findDistributorBoard(distributorId, {
      columns,
      summaryStatuses: ACTIVE,
      perColumn: 5,
      sort: "delivery_asc",
      driverId: "driver-1",
    });

    for (const [args] of prisma.order.findMany.mock.calls) {
      expect(args.where.driver_id).toBe("driver-1");
    }
    expect(prisma.order.groupBy.mock.calls[0][0].where.driver_id).toBe("driver-1");
  });
});

describe("orderRepository.countDistributorQueue", () => {
  it("conta por status sem trazer nenhum pedido", async () => {
    prisma.order.groupBy.mockResolvedValue(groupRows({ [OrderStatus.SENT_TO_DISTRIBUTOR]: 3 }));
    prisma.order.count.mockResolvedValue(1);

    const result = await orderRepository.countDistributorQueue(distributorId, ACTIVE);

    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ statusCounts: { [OrderStatus.SENT_TO_DISTRIBUTOR]: 3 }, overdueActive: 1 });
  });
});

describe("atrasados usa o dia de Brasília, não o de UTC", () => {
  const base = { summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "created_desc" as const };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("às 21h30 de Brasília (00h30 UTC do dia seguinte) o pedido de hoje NÃO conta como atrasado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:30:00.000Z")); // 12/06 21:30 em Brasília

    await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      statuses: [OrderStatus.SENT_TO_DISTRIBUTOR],
    });

    // Atrasado = entrega anterior a 12/06 (hoje em Brasília). Com UTC seria 13/06, e os pedidos de hoje entrariam.
    const overdueCall = prisma.order.count.mock.calls
      .map(([args]) => args.where)
      .find((where: { delivery_date?: { lt?: Date } }) => where.delivery_date?.lt);
    expect(overdueCall.delivery_date.lt).toEqual(new Date("2026-06-12T00:00:00.000Z"));
  });

  it("o quadro e o resumo leve usam o mesmo corte", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:30:00.000Z"));

    await orderRepository.findDistributorBoard(distributorId, {
      columns: { incoming: [OrderStatus.SENT_TO_DISTRIBUTOR] },
      summaryStatuses: ACTIVE,
      perColumn: 5,
      sort: "created_desc",
    });
    await orderRepository.countDistributorQueue(distributorId, ACTIVE);

    const cuts = prisma.order.count.mock.calls.map(([args]) => args.where.delivery_date?.lt);
    expect(cuts).toHaveLength(2);
    for (const cut of cuts) expect(cut).toEqual(new Date("2026-06-12T00:00:00.000Z"));
  });
});

describe("entrega mais próxima em etapa ativa: ordena em memória", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const created = (n: number) => new Date(`2026-06-0${n}T10:00:00.000Z`);
  const base = { summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "delivery_asc" as const };

  // Sem ORDER BY/LIMIT as chaves vêm em qualquer ordem; as linhas completas vêm por id.
  const keys = [
    { id: "d", delivery_date: day("2026-06-10"), scheduled_time_start_hour: null, created_at: created(1) },
    { id: "b", delivery_date: day("2026-06-10"), scheduled_time_start_hour: 14, created_at: created(2) },
    { id: "a", delivery_date: day("2026-06-10"), scheduled_time_start_hour: 9, created_at: created(3) },
    { id: "c", delivery_date: day("2026-06-10"), scheduled_time_start_hour: 14, created_at: created(1) },
  ];

  beforeEach(() => {
    prisma.order.findMany.mockImplementation(async (args: { select: Record<string, unknown>; where: { id?: { in: string[] } } }) =>
      args.where.id ? [...args.where.id.in].reverse().map((id) => ({ id })) : keys
    );
  });

  it("não usa ORDER BY/LIMIT na busca das chaves (o planner varreria o histórico inteiro)", async () => {
    await orderRepository.findByDistributorPaged(distributorId, { ...base, statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR] });

    const [keysCall, rowsCall] = prisma.order.findMany.mock.calls.map(([args]) => args);
    expect(keysCall).not.toHaveProperty("orderBy");
    expect(keysCall).not.toHaveProperty("take");
    expect(keysCall.select).toEqual({ id: true, delivery_date: true, scheduled_time_start_hour: true, created_at: true });
    expect(rowsCall.where).toEqual({ id: { in: expect.any(Array) } });
    expect(rowsCall.select.consumer).toBeDefined();
  });

  it("ordena por data, hora (sem hora por último), criação e id", async () => {
    const result = await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR],
    });

    // Todos em 10/06: 09h (a) → 14h criado antes (c) → 14h criado depois (b) → sem hora (d), que vai por último
    expect(result.orders.map((o) => o.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("pagina em memória e só lê as linhas completas da página pedida", async () => {
    const result = await orderRepository.findByDistributorPaged(distributorId, {
      ...base,
      page: 2,
      limit: 3,
      statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR],
    });

    expect(result.orders.map((o) => o.id)).toEqual(["d"]);
    const rowsCall = prisma.order.findMany.mock.calls[1][0];
    expect(rowsCall.where.id.in).toEqual(["d"]);
  });

  it("o quadro também usa o caminho em memória em cada coluna", async () => {
    const board = await orderRepository.findDistributorBoard(distributorId, {
      columns: { all: ACTIVE },
      summaryStatuses: ACTIVE,
      perColumn: 2,
      sort: "delivery_asc",
    });

    expect(board.columns.all.orders.map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("histórico continua ordenando no banco: o conjunto é grande e o índice ordenado resolve", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await orderRepository.findByDistributorPaged(distributorId, { ...base, statuses: [OrderStatus.DELIVERED] });

    const args = prisma.order.findMany.mock.calls[0][0];
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(args.take).toBe(30);
    expect(args.orderBy[0]).toEqual({ delivery_date: "asc" });
  });
});
