import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConsumerRole, OrderStatus, ProductKind } from "@xua/shared/enums";
import { disconnectPrisma } from "../infra/prisma/client.js";
import { resetDatabase } from "./prisma-test-client.js";
import {
  createAddress,
  createConsumer,
  createDistributor,
  createOrder,
  createProduct,
  createZone,
} from "./fixtures.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe("fixtures (integração — Postgres real)", () => {
  it("monta a cadeia distribuidora → zona → usuários → endereço → pedido com itens", async () => {
    const distributor = await createDistributor();
    const zone = await createZone(distributor.id);
    const driver = await createConsumer({
      role: ConsumerRole.DRIVER,
      distributor_id: distributor.id,
    });
    const consumer = await createConsumer();
    const address = await createAddress(consumer.id, { zone_id: zone.id });
    const water = await createProduct({ kind: ProductKind.WATER, price_cents: 1200 });

    const order = await createOrder(
      {
        consumerId: consumer.id,
        addressId: address.id,
        distributorId: distributor.id,
        zoneId: zone.id,
      },
      {
        driver_id: driver.id,
        status: OrderStatus.OUT_FOR_DELIVERY,
        items: [
          { product_id: water.id, product_name: water.name, unit_price_cents: 1200, quantity: 3 },
        ],
      }
    );

    expect(driver.role).toBe(ConsumerRole.DRIVER);
    expect(driver.distributor_id).toBe(distributor.id);
    expect(order.driver_id).toBe(driver.id);
    expect(order.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
    // Sentinela do plano: hoje não há como distinguir "não registrou vasilhame"
    // de "coletou zero" — a coluna nasce em 0, nunca nula.
    expect(order.collected_empty_qty).toBe(0);
    expect(order.returned_empty_qty).toBeNull();
  });

  it("cria pedido sem itens quando o teste não depende deles", async () => {
    const distributor = await createDistributor();
    const zone = await createZone(distributor.id);
    const consumer = await createConsumer();
    const address = await createAddress(consumer.id, { zone_id: zone.id });

    const order = await createOrder({
      consumerId: consumer.id,
      addressId: address.id,
      distributorId: distributor.id,
      zoneId: zone.id,
    });

    expect(order.status).toBe(OrderStatus.CREATED);
    expect(order.driver_id).toBeNull();
  });

  it("gera e-mail e documento únicos entre chamadas", async () => {
    const a = await createConsumer();
    const b = await createConsumer();

    expect(a.email).not.toBe(b.email);
    expect(a.document).not.toBe(b.document);
  });
});
