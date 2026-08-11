import { randomUUID } from "crypto";
import type { Address, Consumer, Distributor, Order, Product, Zone } from "@prisma/client";
import { ConsumerRole, DeliveryWindow, OrderStatus, ProductKind } from "@xua/shared/enums";
import { getPrisma } from "../infra/prisma/client.js";

function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export async function createDistributor(
  overrides: Partial<{
    name: string;
    cnpj: string;
    phone: string;
    email: string;
    is_active: boolean;
  }> = {}
): Promise<Distributor> {
  const prisma = getPrisma();
  const suffix = randomUUID().slice(0, 8);
  return prisma.distributor.create({
    data: {
      name: overrides.name ?? `Distribuidora Teste ${suffix}`,
      cnpj: overrides.cnpj ?? randomDigits(14),
      phone: overrides.phone ?? "11999999999",
      email: overrides.email ?? `distribuidora-${suffix}@teste.local`,
      is_active: overrides.is_active ?? true,
    },
  });
}

export async function createZone(
  distributorId: string,
  overrides: Partial<{ name: string; is_active: boolean }> = {}
): Promise<Zone> {
  const prisma = getPrisma();
  const suffix = randomUUID().slice(0, 8);
  return prisma.zone.create({
    data: {
      distributor_id: distributorId,
      name: overrides.name ?? `Zona Teste ${suffix}`,
      is_active: overrides.is_active ?? true,
    },
  });
}

/**
 * Cria um usuário. Motorista, admin de distribuidora e ops moram na mesma
 * tabela do consumidor — o que muda é `role` (e `distributor_id`, para
 * motorista/admin). Passe `role: ConsumerRole.DRIVER` para um motorista.
 */
export async function createConsumer(
  overrides: Partial<{
    name: string;
    email: string;
    phone: string;
    document: string;
    password_hash: string;
    role: (typeof ConsumerRole)[keyof typeof ConsumerRole];
    is_active: boolean;
    distributor_id: string | null;
  }> = {}
): Promise<Consumer> {
  const prisma = getPrisma();
  const suffix = randomUUID().slice(0, 8);
  return prisma.consumer.create({
    data: {
      name: overrides.name ?? `Usuario Teste ${suffix}`,
      email: overrides.email ?? `usuario-${suffix}@teste.local`,
      phone: overrides.phone ?? "11988887777",
      document: overrides.document ?? randomDigits(11),
      // Hash bcrypt fixo e inválido para login — fixture nunca autentica.
      password_hash: overrides.password_hash ?? "$2b$10$fixture.hash.nao.usar.em.login",
      role: overrides.role ?? ConsumerRole.CONSUMER,
      is_active: overrides.is_active ?? true,
      distributor_id: overrides.distributor_id ?? null,
    },
  });
}

export async function createAddress(
  consumerId: string,
  overrides: Partial<{
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
    zone_id: string | null;
    is_default: boolean;
  }> = {}
): Promise<Address> {
  const prisma = getPrisma();
  return prisma.address.create({
    data: {
      consumer_id: consumerId,
      street: overrides.street ?? "Rua Teste",
      number: overrides.number ?? "100",
      complement: overrides.complement ?? null,
      neighborhood: overrides.neighborhood ?? "Centro",
      city: overrides.city ?? "Juiz de Fora",
      state: overrides.state ?? "MG",
      zip_code: overrides.zip_code ?? "36000000",
      zone_id: overrides.zone_id ?? null,
      is_default: overrides.is_default ?? true,
    },
  });
}

export async function createProduct(
  overrides: Partial<{
    name: string;
    price_cents: number;
    kind: (typeof ProductKind)[keyof typeof ProductKind];
    bottle_product_id: string | null;
    is_active: boolean;
  }> = {}
): Promise<Product> {
  const prisma = getPrisma();
  const suffix = randomUUID().slice(0, 8);
  return prisma.product.create({
    data: {
      name: overrides.name ?? `Produto Teste ${suffix}`,
      price_cents: overrides.price_cents ?? 1200,
      kind: overrides.kind ?? ProductKind.OTHER,
      bottle_product_id: overrides.bottle_product_id ?? null,
      is_active: overrides.is_active ?? true,
    },
  });
}

/**
 * Cria um pedido. `items` é opcional — passe apenas quando o teste depender
 * dos itens (cada item exige um Product já existente, veja `createProduct`).
 */
export async function createOrder(
  params: {
    consumerId: string;
    addressId: string;
    distributorId: string;
    zoneId: string;
  },
  overrides: Partial<{
    driver_id: string | null;
    status: (typeof OrderStatus)[keyof typeof OrderStatus];
    delivery_date: Date;
    delivery_window: (typeof DeliveryWindow)[keyof typeof DeliveryWindow];
    subtotal_cents: number;
    total_cents: number;
    items: Array<{
      product_id: string;
      product_name: string;
      unit_price_cents: number;
      quantity: number;
    }>;
  }> = {}
): Promise<Order> {
  const prisma = getPrisma();
  const items = overrides.items ?? [];
  return prisma.order.create({
    data: {
      consumer_id: params.consumerId,
      address_id: params.addressId,
      distributor_id: params.distributorId,
      zone_id: params.zoneId,
      driver_id: overrides.driver_id ?? null,
      status: overrides.status ?? OrderStatus.CREATED,
      delivery_date: overrides.delivery_date ?? new Date("2026-06-01T00:00:00.000Z"),
      delivery_window: overrides.delivery_window ?? DeliveryWindow.MORNING,
      subtotal_cents: overrides.subtotal_cents ?? 0,
      total_cents: overrides.total_cents ?? 0,
      ...(items.length > 0
        ? {
            items: {
              create: items.map((item) => ({
                product_id: item.product_id,
                product_name: item.product_name,
                unit_price_cents: item.unit_price_cents,
                quantity: item.quantity,
                subtotal_cents: item.unit_price_cents * item.quantity,
              })),
            },
          }
        : {}),
    },
  });
}
