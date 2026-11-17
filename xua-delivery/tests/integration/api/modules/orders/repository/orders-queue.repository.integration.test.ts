import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerRole, OrderStatus } from "@xua/shared/enums";
import { disconnectPrisma } from "@api/infra/prisma/client.js";
import { orderRepository } from "@api/modules/orders/repository/orders.repository.js";
import { resetDatabase } from "@tests/support/prisma-test-client.js";
import {
  createAddress,
  createConsumer,
  createDistributor,
  createOrder,
  createProduct,
  createZone,
} from "@tests/support/fixtures.js";

// Integração da fila do distribuidor contra o Postgres real. Os testes unitários só provam que o
// repositório monta o `where` esperado; aqui o banco executa de verdade: a coluna `delivery_date`
// é `DATE`, o `groupBy` agrega de fato e o isolamento entre distribuidoras vem do SQL, não de mock.

const { SENT_TO_DISTRIBUTOR, ACCEPTED_BY_DISTRIBUTOR, READY_FOR_DISPATCH, OUT_FOR_DELIVERY, DELIVERED } =
  OrderStatus;

const ACTIVE = [SENT_TO_DISTRIBUTOR, ACCEPTED_BY_DISTRIBUTOR, READY_FOR_DISPATCH, OUT_FOR_DELIVERY];

// 12/06/2026 21:30 em Brasília = 13/06 00:30 UTC. É a hora em que o "hoje" em UTC já virou.
const NIGHT_IN_BRASILIA = new Date("2026-06-13T00:30:00.000Z");
const TODAY = new Date("2026-06-12T00:00:00.000Z");
const YESTERDAY = new Date("2026-06-11T00:00:00.000Z");
const TOMORROW = new Date("2026-06-13T00:00:00.000Z");

async function seedWorld() {
  const distributor = await createDistributor();
  const zone = await createZone(distributor.id);
  const consumer = await createConsumer({ name: "Maria da Silva" });
  const address = await createAddress(consumer.id, { zone_id: zone.id });
  const params = { consumerId: consumer.id, addressId: address.id, distributorId: distributor.id, zoneId: zone.id };
  return { distributor, zone, consumer, address, params };
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe("fila do distribuidor (integração — Postgres real)", () => {
  const base = { summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "created_desc" as const };

  it("só enxerga os pedidos da própria distribuidora", async () => {
    const mine = await seedWorld();
    const other = await seedWorld();
    await createOrder(mine.params, { status: SENT_TO_DISTRIBUTOR });
    await createOrder(other.params, { status: SENT_TO_DISTRIBUTOR });
    await createOrder(other.params, { status: SENT_TO_DISTRIBUTOR });

    const result = await orderRepository.findByDistributorPaged(mine.distributor.id, {
      ...base,
      statuses: [SENT_TO_DISTRIBUTOR],
    });
    const count = await orderRepository.countDistributorQueue(mine.distributor.id, ACTIVE);

    expect(result.total).toBe(1);
    expect(result.orders).toHaveLength(1);
    expect(count.statusCounts).toEqual({ [SENT_TO_DISTRIBUTOR]: 1 });
  });

  it("pagina sem repetir nem perder pedido e o total sai do groupBy", async () => {
    const world = await seedWorld();
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      ids.push((await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR })).id);
    }
    await createOrder(world.params, { status: READY_FOR_DISPATCH });

    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(
        await orderRepository.findByDistributorPaged(world.distributor.id, {
          ...base,
          page,
          limit: 3,
          statuses: [SENT_TO_DISTRIBUTOR],
        })
      );
    }

    expect(pages.map((p) => p.orders.length)).toEqual([3, 3, 1]);
    expect(pages.every((p) => p.total === 7)).toBe(true);
    const seen = pages.flatMap((p) => p.orders.map((o) => o.id));
    expect(new Set(seen).size).toBe(7);
    // created_desc: o último criado vem primeiro.
    expect(seen).toEqual([...ids].reverse());
    // O resumo conta as demais etapas ativas, que não entram na página.
    expect(pages[0].statusCounts).toEqual({ [SENT_TO_DISTRIBUTOR]: 7, [READY_FOR_DISPATCH]: 1 });
  });

  it("histórico: total vem do count e não mistura com o resumo ativo", async () => {
    const world = await seedWorld();
    await createOrder(world.params, { status: DELIVERED });
    await createOrder(world.params, { status: DELIVERED });
    await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR });

    const result = await orderRepository.findByDistributorPaged(world.distributor.id, {
      ...base,
      statuses: [DELIVERED],
    });

    expect(result.total).toBe(2);
    expect(result.statusCounts).toEqual({ [SENT_TO_DISTRIBUTOR]: 1 });
  });

  it("filtra por motorista, sem motorista, busca por nome/produto e dia de entrega", async () => {
    const world = await seedWorld();
    const driver = await createConsumer({
      role: ConsumerRole.DRIVER,
      distributor_id: world.distributor.id,
    });
    const product = await createProduct({ name: "Agua Mineral 20L" });
    const item = { product_id: product.id, product_name: product.name, unit_price_cents: 1200, quantity: 1 };

    const withDriver = await createOrder(world.params, {
      status: OUT_FOR_DELIVERY,
      driver_id: driver.id,
      delivery_date: TODAY,
      items: [item],
    });
    const noDriver = await createOrder(world.params, { status: OUT_FOR_DELIVERY, delivery_date: TOMORROW });

    const run = (extra: object) =>
      orderRepository
        .findByDistributorPaged(world.distributor.id, { ...base, statuses: [OUT_FOR_DELIVERY], ...extra })
        .then((r) => r.orders.map((o) => o.id));

    expect(await run({ driverId: driver.id })).toEqual([withDriver.id]);
    expect(await run({ driverId: "unassigned" })).toEqual([noDriver.id]);
    expect(await run({ q: "mineral" })).toEqual([withDriver.id]);
    expect(await run({ q: "maria" })).toHaveLength(2);
    expect(await run({ q: "ninguem-com-esse-nome" })).toEqual([]);
    expect(await run({ deliveryDate: "2026-06-12" })).toEqual([withDriver.id]);
    expect(await run({ start: "2026-06-12", end: "2026-06-13" })).toHaveLength(2);
  });

  it("ordena por entrega mais próxima", async () => {
    const world = await seedWorld();
    const late = await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR, delivery_date: TOMORROW });
    const soon = await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR, delivery_date: YESTERDAY });

    const result = await orderRepository.findByDistributorPaged(world.distributor.id, {
      ...base,
      sort: "delivery_asc",
      statuses: [SENT_TO_DISTRIBUTOR],
    });

    expect(result.orders.map((o) => o.id)).toEqual([soon.id, late.id]);
  });

  it("o select enxuto devolve só o que a fila usa", async () => {
    const world = await seedWorld();
    await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR });

    const [order] = (
      await orderRepository.findByDistributorPaged(world.distributor.id, {
        ...base,
        statuses: [SENT_TO_DISTRIBUTOR],
      })
    ).orders;

    expect(order).toHaveProperty("consumer");
    expect(order).toHaveProperty("address");
    expect(order).not.toHaveProperty("delivery_instructions");
    expect(order).not.toHaveProperty("nps_comment");
  });
});

describe("quadro da fila (integração — Postgres real)", () => {
  it("limita cada coluna a perColumn mas traz o total real da etapa", async () => {
    const world = await seedWorld();
    for (let i = 0; i < 5; i++) await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR });
    for (let i = 0; i < 3; i++) await createOrder(world.params, { status: ACCEPTED_BY_DISTRIBUTOR });
    for (let i = 0; i < 2; i++) await createOrder(world.params, { status: READY_FOR_DISPATCH });
    await createOrder(world.params, { status: OUT_FOR_DELIVERY });
    await createOrder(world.params, { status: DELIVERED });

    const board = await orderRepository.findDistributorBoard(world.distributor.id, {
      columns: {
        incoming: [SENT_TO_DISTRIBUTOR],
        preparation: [ACCEPTED_BY_DISTRIBUTOR, READY_FOR_DISPATCH],
        route: [OUT_FOR_DELIVERY],
      },
      summaryStatuses: ACTIVE,
      perColumn: 2,
      sort: "created_desc",
    });

    expect(board.columns.incoming.orders).toHaveLength(2);
    expect(board.columns.incoming.total).toBe(5);
    expect(board.columns.preparation.orders).toHaveLength(2);
    expect(board.columns.preparation.total).toBe(5);
    expect(board.columns.route.orders).toHaveLength(1);
    expect(board.columns.route.total).toBe(1);
    // Entregue está fora das colunas e do resumo.
    expect(Object.keys(board.statusCounts)).not.toContain(DELIVERED);
    // Cada coluna só traz pedidos da própria etapa.
    const preparationStatuses = board.columns.preparation.orders.map((o) => o.status);
    expect(preparationStatuses.every((s) => s === ACCEPTED_BY_DISTRIBUTOR || s === READY_FOR_DISPATCH)).toBe(true);
  });
});

describe("atrasados no dia de Brasília (integração — Postgres real)", () => {
  // Só o `Date` é falsificado: os timers do driver do Postgres continuam reais.
  function freezeAt(instant: Date) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(instant);
  }

  it("às 21h30 de Brasília o pedido de hoje não é atrasado; o de ontem é", async () => {
    const world = await seedWorld();
    await createOrder(world.params, { status: ACCEPTED_BY_DISTRIBUTOR, delivery_date: YESTERDAY });
    await createOrder(world.params, { status: ACCEPTED_BY_DISTRIBUTOR, delivery_date: TODAY });
    await createOrder(world.params, { status: SENT_TO_DISTRIBUTOR, delivery_date: TOMORROW });
    // Atrasado só vale para pedido ainda em andamento.
    await createOrder(world.params, { status: DELIVERED, delivery_date: YESTERDAY });
    freezeAt(NIGHT_IN_BRASILIA);

    const list = await orderRepository.findByDistributorPaged(world.distributor.id, {
      summaryStatuses: ACTIVE,
      page: 1,
      limit: 30,
      sort: "created_desc",
      statuses: [ACCEPTED_BY_DISTRIBUTOR],
    });
    const board = await orderRepository.findDistributorBoard(world.distributor.id, {
      columns: { all: ACTIVE },
      summaryStatuses: ACTIVE,
      perColumn: 10,
      sort: "created_desc",
    });
    const light = await orderRepository.countDistributorQueue(world.distributor.id, ACTIVE);

    expect(list.overdueActive).toBe(1);
    expect(board.overdueActive).toBe(1);
    expect(light.overdueActive).toBe(1);
  });

  it("de manhã, no mesmo dia, o resultado é o mesmo (UTC e Brasília coincidem)", async () => {
    const world = await seedWorld();
    await createOrder(world.params, { status: ACCEPTED_BY_DISTRIBUTOR, delivery_date: YESTERDAY });
    await createOrder(world.params, { status: ACCEPTED_BY_DISTRIBUTOR, delivery_date: TODAY });
    freezeAt(new Date("2026-06-12T13:00:00.000Z")); // 10h em Brasília

    const light = await orderRepository.countDistributorQueue(world.distributor.id, ACTIVE);

    expect(light.overdueActive).toBe(1);
  });
});
