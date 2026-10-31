import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ActorType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { disconnectPrisma, getPrisma } from "@api/infra/prisma/client.js";
import { resetDatabase } from "@tests/support/prisma-test-client.js";
import {
  createAddress,
  createConsumer,
  createDistributor,
  createOrder,
  createZone,
} from "@tests/support/fixtures.js";
import { receiptService } from "@api/modules/orders/services/receipt.service.js";

// Integração: a numeração do comprovante depende de UPDATE … RETURNING com lock
// de linha e da unique (distributor_id, number) — nada disso aparece com Prisma
// mockado. Ver docs/doc_desenvolvimento/testes-e-ci.md para subir o banco.

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedOrders(count: number, status: string = OrderStatus.ACCEPTED_BY_DISTRIBUTOR) {
  const distributor = await createDistributor();
  const zone = await createZone(distributor.id);
  const consumer = await createConsumer();
  const address = await createAddress(consumer.id, { zone_id: zone.id });
  const orders = [];
  for (let index = 0; index < count; index++) {
    orders.push(
      await createOrder(
        { consumerId: consumer.id, addressId: address.id, distributorId: distributor.id, zoneId: zone.id },
        { status: status as never, total_cents: 1000, subtotal_cents: 1000 }
      )
    );
  }
  return { distributor, orders };
}

const actor = { type: ActorType.OPS, id: "ops-user", sourceApp: SourceApp.OPS_CONSOLE };

describe("receiptService (integração — Postgres real)", () => {
  it("emissões concorrentes na mesma distribuidora geram 1..N sem repetir nem pular", async () => {
    const { distributor, orders } = await seedOrders(10);

    const results = await Promise.all(orders.map((order) => receiptService.issue(order.id, actor)));

    const numbers = results.map((result) => result.receipt.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const counter = await getPrisma().distributor.findUniqueOrThrow({
      where: { id: distributor.id },
      select: { next_receipt_number: true },
    });
    expect(counter.next_receipt_number).toBe(11);
  });

  it("cada distribuidora tem sua própria sequência", async () => {
    const first = await seedOrders(2);
    const second = await seedOrders(1);

    await receiptService.issue(first.orders[0]!.id, actor);
    await receiptService.issue(first.orders[1]!.id, actor);
    const other = await receiptService.issue(second.orders[0]!.id, actor);

    expect(other.receipt.number).toBe(1);
  });

  it("emitir o mesmo pedido em paralelo devolve um único comprovante e não consome número", async () => {
    const { distributor, orders } = await seedOrders(1);
    const orderId = orders[0]!.id;

    const results = await Promise.all([
      receiptService.issue(orderId, actor),
      receiptService.issue(orderId, actor),
      receiptService.issue(orderId, actor),
    ]);

    expect(new Set(results.map((result) => result.receipt.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    const counter = await getPrisma().distributor.findUniqueOrThrow({
      where: { id: distributor.id },
      select: { next_receipt_number: true },
    });
    expect(counter.next_receipt_number).toBe(2);
  });

  it("impressão incrementa print_count e marca a segunda como 2ª via", async () => {
    const { orders } = await seedOrders(1);
    const orderId = orders[0]!.id;
    await receiptService.issue(orderId, actor);

    const [first] = await receiptService.loadForPrint([orderId], actor, "a4");
    const [second] = await receiptService.loadForPrint([orderId], actor, "a4");

    expect(first!.is_copy).toBe(false);
    expect(second!.is_copy).toBe(true);
    const stored = await getPrisma().salesReceipt.findUniqueOrThrow({ where: { order_id: orderId } });
    expect(stored.print_count).toBe(2);
  });
});
