import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, DeliveryWindow, OrderStatus, PaymentStatus, PaymentKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── IDs fixos para idempotência ────────────────────────────────
const ID = {
  product20l:      "00000000-0000-0000-0000-000000000001",
  distributor:     "00000000-0000-0000-0000-000000000010",
  zone:            "00000000-0000-0000-0000-000000000020",
  zoneCov1:        "00000000-0000-0000-0000-000000000030",
  zoneCov2:        "00000000-0000-0000-0000-000000000031",
  consumer:        "00000000-0000-0000-0000-000000000100",
  adminUser:       "00000000-0000-0000-0000-000000000101",
  driver:          "00000000-0000-0000-0000-000000000102",
  opsUser:         "00000000-0000-0000-0000-000000000103",
  supportUser:     "00000000-0000-0000-0000-000000000104",
  address:         "00000000-0000-0000-0000-000000000200",
  order1:          "00000000-0000-0000-0000-000000000300",
  orderItem1:      "00000000-0000-0000-0000-000000000400",
  payment1:        "00000000-0000-0000-0000-000000000500",
};

// Próxima data de entrega útil (dia seguinte)
function nextDeliveryDate(offsetDays = 1): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 12);

  // ── 1. Produto ────────────────────────────────────────────────
  await prisma.product.upsert({
    where: { id: ID.product20l },
    update: {},
    create: {
      id: ID.product20l,
      name: "Galão de Água 20L",
      description: "Galão de água mineral natural de 20 litros.",
      price_cents: 2500,
      deposit_cents: 1000,
      is_active: true,
    },
  });
  console.log("✅ Produto: Galão de Água 20L");

  // ── 2. Distribuidor ───────────────────────────────────────────
  await prisma.distributor.upsert({
    where: { id: ID.distributor },
    update: {},
    create: {
      id: ID.distributor,
      name: "Distribuidora Xuá SP",
      cnpj: "12.345.678/0001-99",
      phone: "(11) 91234-5678",
      email: "contato@xua.com.br",
      acceptance_sla_seconds: 300,
      is_active: true,
    },
  });
  console.log("✅ Distribuidor: Distribuidora Xuá SP");

  // ── 3. Zona ───────────────────────────────────────────────────
  await prisma.zone.upsert({
    where: { id: ID.zone },
    update: {},
    create: {
      id: ID.zone,
      distributor_id: ID.distributor,
      name: "Zona Centro-SP",
      is_active: true,
    },
  });
  console.log("✅ Zona: Zona Centro-SP");

  // ── 4. Cobertura da zona ──────────────────────────────────────
  await prisma.zoneCoverage.upsert({
    where: { id: ID.zoneCov1 },
    update: {},
    create: {
      id: ID.zoneCov1,
      zone_id: ID.zone,
      neighborhood: "Centro",
      zip_code: "01310-100",
    },
  });
  await prisma.zoneCoverage.upsert({
    where: { id: ID.zoneCov2 },
    update: {},
    create: {
      id: ID.zoneCov2,
      zone_id: ID.zone,
      neighborhood: "Consolação",
      zip_code: "01303-001",
    },
  });
  console.log("✅ Cobertura: Centro, Consolação");

  // ── 5. Usuários ───────────────────────────────────────────────
  const users = [
    { id: ID.consumer,    name: "João da Silva",   email: "joao@xua.com.br",   role: "consumer",           phone: "(11) 99001-1001" },
    { id: ID.adminUser,   name: "Ana Distribuidora", email: "admin@xua.com.br", role: "distributor_admin",  phone: "(11) 99001-1002" },
    { id: ID.driver,      name: "Carlos Motorista",  email: "driver@xua.com.br", role: "driver",            phone: "(11) 99001-1003" },
    { id: ID.opsUser,     name: "Fernanda Ops",    email: "ops@xua.com.br",    role: "ops",                phone: "(11) 99001-1004" },
    { id: ID.supportUser, name: "Pedro Suporte",   email: "support@xua.com.br", role: "support",           phone: "(11) 99001-1005" },
  ];

  for (const u of users) {
    await prisma.consumer.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, password_hash: passwordHash },
    });
  }
  console.log("✅ Usuários: consumer, distributor_admin, driver, ops, support (senha: senha123)");

  // ── 6. Endereço do consumidor ─────────────────────────────────
  await prisma.address.upsert({
    where: { id: ID.address },
    update: {},
    create: {
      id: ID.address,
      consumer_id: ID.consumer,
      zone_id: ID.zone,
      label: "Casa",
      street: "Rua das Flores",
      number: "123",
      complement: "Apto 4B",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zip_code: "01310-100",
      is_default: true,
    },
  });
  console.log("✅ Endereço: Rua das Flores, 123 - Centro/SP");

  // ── 7. Capacidade de entrega (hoje + 7 dias) ──────────────────
  const windows = [DeliveryWindow.MORNING, DeliveryWindow.AFTERNOON];
  for (let i = 1; i <= 7; i++) {
    const date = nextDeliveryDate(i);
    for (const window of windows) {
      await prisma.deliveryCapacity.upsert({
        where: { zone_id_delivery_date_window: { zone_id: ID.zone, delivery_date: date, window } },
        update: {},
        create: {
          zone_id: ID.zone,
          delivery_date: date,
          window,
          capacity_total: 20,
          capacity_reserved: 0,
        },
      });
    }
  }
  console.log("✅ Capacidade de entrega: próximos 7 dias (manhã + tarde, 20 slots cada)");

  // ── 8. Pedido de exemplo ──────────────────────────────────────
  const deliveryDate = nextDeliveryDate(1);

  await prisma.order.upsert({
    where: { id: ID.order1 },
    update: {},
    create: {
      id: ID.order1,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      status: OrderStatus.CONFIRMED,
      delivery_date: deliveryDate,
      delivery_window: DeliveryWindow.MORNING,
      subtotal_cents: 2500,
      delivery_fee_cents: 500,
      deposit_cents: 1000,
      deposit_amount_cents: 1000,
      total_cents: 4000,
      qty_20l_sent: null,
      qty_20l_returned: null,
    },
  });

  await prisma.orderItem.upsert({
    where: { id: ID.orderItem1 },
    update: {},
    create: {
      id: ID.orderItem1,
      order_id: ID.order1,
      product_id: ID.product20l,
      product_name: "Galão de Água 20L",
      unit_price_cents: 2500,
      quantity: 1,
      subtotal_cents: 2500,
    },
  });

  await prisma.payment.upsert({
    where: { id: ID.payment1 },
    update: {},
    create: {
      id: ID.payment1,
      order_id: ID.order1,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.CAPTURED,
      amount_cents: 4000,
      provider: "pix",
      external_id: "ext_seed_001",
      paid_at: new Date(),
    },
  });
  console.log("✅ Pedido de exemplo: CONFIRMED, 1x Galão 20L, pagamento PIX capturado");

  console.log("\n🎉 Seed completo! Banco populado com sucesso.");
  console.log("   Todos os usuários têm senha: senha123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

