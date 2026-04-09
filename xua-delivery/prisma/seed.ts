import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import {
  PrismaClient,
  DeliveryWindow,
  OrderStatus,
  PaymentStatus,
  PaymentKind,
  OtpStatus,
  SubscriptionStatus,
  DepositStatus,
  ActorType,
  SourceApp,
  AuditEventType,
  BannerType,
  ConsumerRole,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── IDs fixos para idempotência (UUID v4 válido: versão=4, variante=a) ──
const ID = {
  // Produtos
  product20l:        "00000000-0000-4000-a000-000000000001",
  product10l:        "00000000-0000-4000-a000-000000000002",

  // Distribuidor e zona
  distributor:       "00000000-0000-4000-a000-000000000010",
  zone:              "00000000-0000-4000-a000-000000000020",
  zoneCov1:          "00000000-0000-4000-a000-000000000030",
  zoneCov2:          "00000000-0000-4000-a000-000000000031",

  // Usuários
  consumer:          "00000000-0000-4000-a000-000000000100",  // joao (consumidor principal)
  consumer2:         "00000000-0000-4000-a000-000000000105",  // maria (consumidor assinante)
  adminUser:         "00000000-0000-4000-a000-000000000101",  // distribuidor_admin
  driver:            "00000000-0000-4000-a000-000000000102",  // driver
  opsUser:           "00000000-0000-4000-a000-000000000103",  // ops
  supportUser:       "00000000-0000-4000-a000-000000000104",  // support

  // Endereços
  address:           "00000000-0000-4000-a000-000000000200",
  address2:          "00000000-0000-4000-a000-000000000201",

  // Pedidos (6 cenários de status distintos)
  orderConfirmed:    "00000000-0000-4000-a000-000000000300",  // CONFIRMED (aguardando entrega)
  orderDelivered:    "00000000-0000-4000-a000-000000000301",  // DELIVERED (entregue com OTP)
  orderCancelled:    "00000000-0000-4000-a000-000000000302",  // CANCELLED
  orderOutDelivery:  "00000000-0000-4000-a000-000000000303",  // OUT_FOR_DELIVERY (em rota)
  orderCreated:      "00000000-0000-4000-a000-000000000304",  // CREATED (recém criado)
  orderSentToDist:   "00000000-0000-4000-a000-000000000305",  // SENT_TO_DISTRIBUTOR (fila da Ana)

  // Itens de pedido
  item1:             "00000000-0000-4000-a000-000000000400",
  item2:             "00000000-0000-4000-a000-000000000401",
  item3:             "00000000-0000-4000-a000-000000000402",
  item4:             "00000000-0000-4000-a000-000000000403",
  item5:             "00000000-0000-4000-a000-000000000404",
  item6:             "00000000-0000-4000-a000-000000000405",

  // Pagamentos
  paymentConfirmed:  "00000000-0000-4000-a000-000000000500",  // CAPTURED
  paymentDelivered:  "00000000-0000-4000-a000-000000000501",  // CAPTURED
  paymentCancelled:  "00000000-0000-4000-a000-000000000502",  // REFUNDED
  paymentFailed:     "00000000-0000-4000-a000-000000000503",  // FAILED (pedido CREATED)
  paymentOutDelivery:"00000000-0000-4000-a000-000000000504",  // CAPTURED
  paymentSentToDist: "00000000-0000-4000-a000-000000000505",  // CAPTURED (pedido na fila)

  // Depósitos
  depositConfirmed:  "00000000-0000-4000-a000-000000000600",  // HELD
  depositDelivered:  "00000000-0000-4000-a000-000000000601",  // REFUNDED
  depositOutDelivery:"00000000-0000-4000-a000-000000000602",  // HELD

  // OTPs
  otpDelivered:      "00000000-0000-4000-a000-000000000700",  // USED
  otpOutDelivery:    "00000000-0000-4000-a000-000000000701",  // ACTIVE

  // Assinatura
  subscriptionActive:   "00000000-0000-4000-a000-000000000800",
  subscriptionPaused:   "00000000-0000-4000-a000-000000000801",
  subscriptionCancelled:"00000000-0000-4000-a000-000000000802",

  // Reconciliação
  reconciliation:    "00000000-0000-4000-a000-000000000900",

  // Push token
  pushToken:         "00000000-0000-4000-a000-000000000a00",

  // Webhook event
  webhookEvent:      "00000000-0000-4000-a000-000000000b00",

  // Audit events
  audit01:           "00000000-0000-4000-a000-000000001001",
  audit02:           "00000000-0000-4000-a000-000000001002",
  audit03:           "00000000-0000-4000-a000-000000001003",
  audit04:           "00000000-0000-4000-a000-000000001004",
  audit05:           "00000000-0000-4000-a000-000000001005",
  audit06:           "00000000-0000-4000-a000-000000001006",
  audit07:           "00000000-0000-4000-a000-000000001007",
  audit08:           "00000000-0000-4000-a000-000000001008",
  audit09:           "00000000-0000-4000-a000-000000001009",
  audit10:           "00000000-0000-4000-a000-000000001010",

  // Banners
  bannerCarousel1:   "00000000-0000-4000-a000-000000001101",
  bannerCarousel2:   "00000000-0000-4000-a000-000000001102",
  bannerCarousel3:   "00000000-0000-4000-a000-000000001103",
  bannerFeatured:    "00000000-0000-4000-a000-000000001104",
};

/** Retorna uma data futura zerando o horário */
function futureDate(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Retorna uma data passada zerando o horário */
function pastDate(offsetDays: number): Date {
  return futureDate(-offsetDays);
}

/** Hash SHA-256 simples para simular OTP (não bcrypt para seeds rápidos) */
function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 12);

  // ═══════════════════════════════════════════════════════════════
  // TABELA 3 — 03_mst_distributors (antes dos consumers por FK: Consumer.distributor_id)
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // TABELA 1 — 01_mst_consumers
  // ═══════════════════════════════════════════════════════════════
  const users = [
    { id: ID.consumer,     name: "João da Silva",      email: "joao@xua.com.br",    role: ConsumerRole.CONSUMER,          phone: "(11) 99001-1001" },
    { id: ID.consumer2,    name: "Maria Fernandes",    email: "maria@xua.com.br",   role: ConsumerRole.CONSUMER,          phone: "(11) 99001-1006" },
    { id: ID.adminUser,    name: "Ana Distribuidora",  email: "admin@xua.com.br",   role: ConsumerRole.DISTRIBUTOR_ADMIN, phone: "(11) 99001-1002", distributor_id: ID.distributor },
    { id: ID.driver,       name: "Carlos Motorista",   email: "driver@xua.com.br",  role: ConsumerRole.DRIVER,            phone: "(11) 99001-1003", distributor_id: ID.distributor },
    { id: ID.opsUser,      name: "Fernanda Ops",       email: "ops@xua.com.br",     role: ConsumerRole.OPS,               phone: "(11) 99001-1004" },
    { id: ID.supportUser,  name: "Pedro Suporte",      email: "support@xua.com.br", role: ConsumerRole.SUPPORT,           phone: "(11) 99001-1005" },
  ];
  for (const u of users) {
    await prisma.consumer.upsert({
      where: { id: u.id },
      update: {
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        distributor_id: u.distributor_id ?? null,
      },
      create: { ...u, password_hash: passwordHash },
    });
  }
  console.log("✅ [01] Consumidores: 6 usuários (joao, maria, admin, driver, ops, support) — senha: senha123");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 2 — 02_mst_addresses
  // ═══════════════════════════════════════════════════════════════
  // Endereços são criados depois da zona, mas declaramos os IDs agora.
  // Os upserts acontecem após a criação da zona (abaixo).

  console.log("✅ [03] Distribuidor: Distribuidora Xuá SP (criado antes dos consumers por FK)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 4 — 04_mst_zones
  // ═══════════════════════════════════════════════════════════════
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
  console.log("✅ [04] Zona: Zona Centro-SP");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 5 — 05_mst_zone_coverage
  // ═══════════════════════════════════════════════════════════════
  const coverages = [
    { id: ID.zoneCov1, neighborhood: "Centro",     zip_code: "01310-100" },
    { id: ID.zoneCov2, neighborhood: "Consolação", zip_code: "01303-001" },
  ];
  for (const cov of coverages) {
    await prisma.zoneCoverage.upsert({
      where: { id: cov.id },
      update: {},
      create: { ...cov, zone_id: ID.zone },
    });
  }
  console.log("✅ [05] Coberturas: Centro (01310-100), Consolação (01303-001)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 2 — 02_mst_addresses (agora que a zona existe)
  // ═══════════════════════════════════════════════════════════════
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
  await prisma.address.upsert({
    where: { id: ID.address2 },
    update: {},
    create: {
      id: ID.address2,
      consumer_id: ID.consumer2,
      zone_id: ID.zone,
      label: "Apartamento",
      street: "Alameda Consolação",
      number: "890",
      complement: null,
      neighborhood: "Consolação",
      city: "São Paulo",
      state: "SP",
      zip_code: "01303-001",
      is_default: true,
    },
  });
  console.log("✅ [02] Endereços: João (Centro), Maria (Consolação)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 6 — 06_mst_products
  // ═══════════════════════════════════════════════════════════════
  const products = [
    {
      id: ID.product20l,
      name: "Galão de Água 20L",
      description: "Galão de água mineral natural purificada de 20 litros. Retornável.",
      image_url: "/images/galao-20l.jpg",
      price_cents: 2500,
      deposit_cents: 1000,
      is_active: true,
    },
    {
      id: ID.product10l,
      name: "Garrafão de Água 10L",
      description: "Garrafão de água mineral de 10 litros. Retornável.",
      image_url: null,
      price_cents: 1500,
      deposit_cents: 500,
      is_active: true,
    },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });
  }
  console.log("✅ [06] Produtos: Galão 20L (R$25,00 + R$10,00 depósito), Garrafão 10L (R$15,00 + R$5,00 depósito)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 7 — 07_cfg_delivery_capacity (próximos 30 dias)
  // ═══════════════════════════════════════════════════════════════
  const windows = [DeliveryWindow.MORNING, DeliveryWindow.AFTERNOON];
  for (let i = 1; i <= 30; i++) {
    const date = futureDate(i);
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
  console.log("✅ [07] Capacidade: 30 dias × 2 janelas × 20 slots/zona");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 8 — 08_sec_consumer_push_tokens
  // ═══════════════════════════════════════════════════════════════
  await prisma.consumerPushToken.upsert({
    where: { id: ID.pushToken },
    update: {},
    create: {
      id: ID.pushToken,
      consumer_id: ID.consumer,
      endpoint: "https://fcm.googleapis.com/fcm/send/seed-endpoint-joao",
      p256dh: "BNVwlk2VPY7pYmKFMvkH6wUQ5z2N1RxZ4h8cT9wQm3sA1B2C3D4E5F6G7H8I9J0",
      auth_key: "seed_auth_key_joao_abc123",
    },
  });
  console.log("✅ [08] Push token: João (endpoint simulado)");

  // ═══════════════════════════════════════════════════════════════
  // TABELAS 9–13 — Pedidos, itens, pagamentos, depósitos
  // 5 cenários de status: CONFIRMED, DELIVERED, CANCELLED, OUT_FOR_DELIVERY, CREATED
  // ═══════════════════════════════════════════════════════════════

  // ── Pedido 1: CONFIRMED (amanhã, aguardando entrega) ──────────
  await prisma.order.upsert({
    where: { id: ID.orderConfirmed },
    update: {},
    create: {
      id: ID.orderConfirmed,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      status: OrderStatus.CONFIRMED,
      delivery_date: futureDate(1),
      delivery_window: DeliveryWindow.MORNING,
      subtotal_cents: 2500,
      delivery_fee_cents: 500,
      deposit_cents: 1000,
      deposit_amount_cents: 1000,
      total_cents: 4000,
      accepted_at: new Date(),
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item1 },
    update: {},
    create: {
      id: ID.item1,
      order_id: ID.orderConfirmed,
      product_id: ID.product20l,
      product_name: "Galão de Água 20L",
      unit_price_cents: 2500,
      quantity: 1,
      subtotal_cents: 2500,
    },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentConfirmed },
    update: {},
    create: {
      id: ID.paymentConfirmed,
      order_id: ID.orderConfirmed,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.CAPTURED,
      amount_cents: 4000,
      provider: "pix",
      external_id: "ext_seed_confirmed_001",
      paid_at: pastDate(0),
    },
  });
  await prisma.deposit.upsert({
    where: { id: ID.depositConfirmed },
    update: {},
    create: {
      id: ID.depositConfirmed,
      order_id: ID.orderConfirmed,
      consumer_id: ID.consumer,
      amount_cents: 1000,
      status: DepositStatus.HELD,
    },
  });

  // ── Pedido 2: DELIVERED (ontem, entregue com tudo) ────────────
  await prisma.order.upsert({
    where: { id: ID.orderDelivered },
    update: {},
    create: {
      id: ID.orderDelivered,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      driver_id: ID.driver,
      status: OrderStatus.DELIVERED,
      delivery_date: pastDate(1),
      delivery_window: DeliveryWindow.AFTERNOON,
      subtotal_cents: 5000,
      delivery_fee_cents: 500,
      deposit_cents: 2000,
      deposit_amount_cents: 2000,
      total_cents: 7500,
      qty_20l_sent: 2,
      qty_20l_returned: 2,
      rating: 5,
      rating_comment: "Entrega excelente, pontual e produto gelado!",
      nps_score: 10,
      nps_comment: "Recomendo muito!",
      collected_empty_qty: 2,
      returned_empty_qty: 0,
      bottle_condition: "good",
      payment_status: "paid",
      accepted_at: pastDate(2),
      dispatched_at: pastDate(1),
      delivered_at: pastDate(1),
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item2 },
    update: {},
    create: {
      id: ID.item2,
      order_id: ID.orderDelivered,
      product_id: ID.product20l,
      product_name: "Galão de Água 20L",
      unit_price_cents: 2500,
      quantity: 2,
      subtotal_cents: 5000,
    },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentDelivered },
    update: {},
    create: {
      id: ID.paymentDelivered,
      order_id: ID.orderDelivered,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.CAPTURED,
      amount_cents: 7500,
      provider: "pix",
      external_id: "ext_seed_delivered_002",
      paid_at: pastDate(2),
    },
  });
  await prisma.deposit.upsert({
    where: { id: ID.depositDelivered },
    update: {},
    create: {
      id: ID.depositDelivered,
      order_id: ID.orderDelivered,
      consumer_id: ID.consumer,
      amount_cents: 2000,
      status: DepositStatus.REFUNDED,
      refunded_at: pastDate(1),
    },
  });

  // ── Pedido 3: CANCELLED (cancelado há 3 dias, pagamento estornado) ─
  await prisma.order.upsert({
    where: { id: ID.orderCancelled },
    update: {},
    create: {
      id: ID.orderCancelled,
      consumer_id: ID.consumer2,
      address_id: ID.address2,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      status: OrderStatus.CANCELLED,
      delivery_date: futureDate(2),
      delivery_window: DeliveryWindow.MORNING,
      subtotal_cents: 1500,
      delivery_fee_cents: 500,
      deposit_cents: 500,
      deposit_amount_cents: 500,
      total_cents: 2500,
      cancellation_reason: "consumer_request",
      payment_status: "refunded",
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item3 },
    update: {},
    create: {
      id: ID.item3,
      order_id: ID.orderCancelled,
      product_id: ID.product10l,
      product_name: "Garrafão de Água 10L",
      unit_price_cents: 1500,
      quantity: 1,
      subtotal_cents: 1500,
    },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentCancelled },
    update: {},
    create: {
      id: ID.paymentCancelled,
      order_id: ID.orderCancelled,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.REFUNDED,
      amount_cents: 2500,
      provider: "pix",
      external_id: "ext_seed_cancelled_003",
      paid_at: pastDate(5),
    },
  });

  // ── Pedido 4: OUT_FOR_DELIVERY (hoje, em rota com OTP ativo) ──
  await prisma.order.upsert({
    where: { id: ID.orderOutDelivery },
    update: {},
    create: {
      id: ID.orderOutDelivery,
      consumer_id: ID.consumer2,
      address_id: ID.address2,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      driver_id: ID.driver,
      status: OrderStatus.OUT_FOR_DELIVERY,
      delivery_date: futureDate(0),
      delivery_window: DeliveryWindow.MORNING,
      subtotal_cents: 4000,
      delivery_fee_cents: 500,
      deposit_cents: 1500,
      deposit_amount_cents: 1500,
      total_cents: 6000,
      payment_status: "paid",
      accepted_at: pastDate(0),
      dispatched_at: new Date(),
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item4 },
    update: {},
    create: {
      id: ID.item4,
      order_id: ID.orderOutDelivery,
      product_id: ID.product20l,
      product_name: "Galão de Água 20L",
      unit_price_cents: 2500,
      quantity: 1,
      subtotal_cents: 2500,
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item5 },
    update: {},
    create: {
      id: ID.item5,
      order_id: ID.orderOutDelivery,
      product_id: ID.product10l,
      product_name: "Garrafão de Água 10L",
      unit_price_cents: 1500,
      quantity: 1,
      subtotal_cents: 1500,
    },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentOutDelivery },
    update: {},
    create: {
      id: ID.paymentOutDelivery,
      order_id: ID.orderOutDelivery,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.CAPTURED,
      amount_cents: 6000,
      provider: "pix",
      external_id: "ext_seed_out_004",
      paid_at: pastDate(0),
    },
  });
  await prisma.deposit.upsert({
    where: { id: ID.depositOutDelivery },
    update: {},
    create: {
      id: ID.depositOutDelivery,
      order_id: ID.orderOutDelivery,
      consumer_id: ID.consumer2,
      amount_cents: 1500,
      status: DepositStatus.HELD,
    },
  });

  // ── Pedido 5: CREATED (recém criado, pagamento pendente) ──────
  await prisma.order.upsert({
    where: { id: ID.orderCreated },
    update: {},
    create: {
      id: ID.orderCreated,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      status: OrderStatus.CREATED,
      delivery_date: futureDate(3),
      delivery_window: DeliveryWindow.AFTERNOON,
      subtotal_cents: 2500,
      delivery_fee_cents: 500,
      deposit_cents: 1000,
      deposit_amount_cents: 1000,
      total_cents: 4000,
    },
  });
  // Pagamento FAILED para o pedido CREATED (tentou pagar mas falhou)
  await prisma.payment.upsert({
    where: { id: ID.paymentFailed },
    update: {},
    create: {
      id: ID.paymentFailed,
      order_id: ID.orderCreated,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.FAILED,
      amount_cents: 4000,
      provider: "pix",
      external_id: "ext_seed_failed_005",
    },
  });

  // ── Pedido 6: SENT_TO_DISTRIBUTOR (na fila de aceite — visível para Ana) ─
  await prisma.order.upsert({
    where: { id: ID.orderSentToDist },
    update: {},
    create: {
      id: ID.orderSentToDist,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      status: OrderStatus.SENT_TO_DISTRIBUTOR,
      delivery_date: futureDate(2),
      delivery_window: DeliveryWindow.MORNING,
      subtotal_cents: 2500,
      delivery_fee_cents: 500,
      deposit_cents: 0,
      deposit_amount_cents: 0,
      total_cents: 3000,
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item6 },
    update: {},
    create: {
      id: ID.item6,
      order_id: ID.orderSentToDist,
      product_id: ID.product20l,
      product_name: "Galão de Água 20L",
      unit_price_cents: 2500,
      quantity: 1,
      subtotal_cents: 2500,
    },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentSentToDist },
    update: {},
    create: {
      id: ID.paymentSentToDist,
      order_id: ID.orderSentToDist,
      kind: PaymentKind.ORDER,
      status: PaymentStatus.CAPTURED,
      amount_cents: 3000,
      provider: "pix",
      external_id: "ext_seed_sent_006",
      paid_at: new Date(),
    },
  });

  console.log("✅ [09] Pedidos: CONFIRMED, DELIVERED, CANCELLED, OUT_FOR_DELIVERY, CREATED, SENT_TO_DISTRIBUTOR");
  console.log("✅ [10] Itens de pedido: 6 itens distribuídos nos 6 pedidos");
  console.log("✅ [13] Pagamentos: CAPTURED×4, REFUNDED×1, FAILED×1");
  console.log("✅ [15] Depósitos: HELD×2 (ativo/transporte), REFUNDED×1 (entregue)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 16 — 16_sec_order_otps
  // OTP USED para pedido DELIVERED; OTP ACTIVE para OUT_FOR_DELIVERY
  // ═══════════════════════════════════════════════════════════════
  await prisma.orderOtp.upsert({
    where: { id: ID.otpDelivered },
    update: {},
    create: {
      id: ID.otpDelivered,
      order_id: ID.orderDelivered,
      otp_hash: hashOtp("482910"),
      status: OtpStatus.USED,
      attempts: 1,
      expires_at: pastDate(0),
    },
  });
  await prisma.orderOtp.upsert({
    where: { id: ID.otpOutDelivery },
    update: {},
    create: {
      id: ID.otpOutDelivery,
      order_id: ID.orderOutDelivery,
      otp_hash: hashOtp("731524"),
      status: OtpStatus.ACTIVE,
      attempts: 0,
      expires_at: futureDate(1),
    },
  });
  console.log("✅ [16] OTPs: USED (pedido entregue, código 482910), ACTIVE (em rota, código 731524)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 11 — 11_trn_subscriptions (3 cenários)
  // ═══════════════════════════════════════════════════════════════
  await prisma.subscription.upsert({
    where: { id: ID.subscriptionActive },
    update: {},
    create: {
      id: ID.subscriptionActive,
      consumer_id: ID.consumer,
      address_id: ID.address,
      product_id: ID.product20l,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      quantity: 2,
      delivery_window: DeliveryWindow.MORNING,
      delivery_day_of_month: 10,
      status: SubscriptionStatus.ACTIVE,
      next_delivery_date: futureDate(7),
      qty_20l: 2,
      weekday: 1, // segunda-feira
    },
  });
  await prisma.subscription.upsert({
    where: { id: ID.subscriptionPaused },
    update: {},
    create: {
      id: ID.subscriptionPaused,
      consumer_id: ID.consumer2,
      address_id: ID.address2,
      product_id: ID.product10l,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      quantity: 1,
      delivery_window: DeliveryWindow.AFTERNOON,
      status: SubscriptionStatus.PAUSED,
      next_delivery_date: null,
      qty_20l: 0,
    },
  });
  await prisma.subscription.upsert({
    where: { id: ID.subscriptionCancelled },
    update: {},
    create: {
      id: ID.subscriptionCancelled,
      consumer_id: ID.consumer,
      address_id: ID.address,
      product_id: ID.product10l,
      distributor_id: ID.distributor,
      zone_id: ID.zone,
      quantity: 1,
      delivery_window: DeliveryWindow.AFTERNOON,
      status: SubscriptionStatus.CANCELLED,
      next_delivery_date: null,
      qty_20l: 0,
    },
  });
  console.log("✅ [11] Assinaturas: ACTIVE (João, 20L quinzenal), PAUSED (Maria, 10L), CANCELLED (João, 10L)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 12 — 12_piv_subscription_orders
  // Vincula assinatura ativa ao pedido CONFIRMED
  // ═══════════════════════════════════════════════════════════════
  await prisma.subscriptionOrder.upsert({
    where: {
      subscription_id_order_id: {
        subscription_id: ID.subscriptionActive,
        order_id: ID.orderConfirmed,
      },
    },
    update: {},
    create: {
      subscription_id: ID.subscriptionActive,
      order_id: ID.orderConfirmed,
    },
  });
  console.log("✅ [12] SubscriptionOrder: assinatura ACTIVE vinculada ao pedido CONFIRMED");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 14 — 14_cfg_payment_webhook_events
  // ═══════════════════════════════════════════════════════════════
  await prisma.paymentWebhookEvent.upsert({
    where: { id: ID.webhookEvent },
    update: {},
    create: {
      id: ID.webhookEvent,
      provider: "pix",
      provider_event_ref: "pix_webhook_seed_001",
      event_type: "payment.captured",
      payload: {
        amount: 4000,
        order_id: ID.orderConfirmed,
        external_id: "ext_seed_confirmed_001",
        status: "captured",
        timestamp: new Date().toISOString(),
      },
    },
  });
  console.log("✅ [14] Webhook: payment.captured para pedido CONFIRMED");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 17 — 17_trn_reconciliations
  // ═══════════════════════════════════════════════════════════════
  await prisma.reconciliation.upsert({
    where: { id: ID.reconciliation },
    update: {},
    create: {
      id: ID.reconciliation,
      distributor_id: ID.distributor,
      reconciliation_date: pastDate(1),
      full_out: 4,          // 4 galões despachados
      empty_returned: 4,    // 4 galões retornados
      delta: 0,             // sem diferença
      justification: null,
      closed_by: ID.opsUser,
    },
  });
  console.log("✅ [17] Reconciliação: 4 galões out / 4 retornados / delta 0 (ontem)");

  // ═══════════════════════════════════════════════════════════════
  // TABELA 18 — 18_aud_audit_events
  // Ciclo completo do pedido DELIVERED: criação → confirmação →
  // despacho → OTP gerado → entregue + pagamento + depósito
  // ═══════════════════════════════════════════════════════════════
  const delivered_at = pastDate(1);
  const dispatched_at = pastDate(1);
  const confirmed_at = pastDate(2);
  const created_at = pastDate(3);

  const auditEvents = [
    {
      id: ID.audit01,
      event_type: AuditEventType.ORDER_CREATED,
      actor_type: ActorType.CONSUMER,
      actor_id: ID.consumer,
      order_id: ID.orderDelivered,
      source_app: SourceApp.CONSUMER_WEB,
      payload: { status: "CREATED" },
      occurred_at: created_at,
    },
    {
      id: ID.audit02,
      event_type: AuditEventType.PAYMENT_CREATED,
      actor_type: ActorType.SYSTEM,
      actor_id: "system",
      order_id: ID.orderDelivered,
      source_app: SourceApp.BACKEND,
      payload: { payment_id: ID.paymentDelivered, amount_cents: 7500 },
      occurred_at: created_at,
    },
    {
      id: ID.audit03,
      event_type: AuditEventType.PAYMENT_CAPTURED,
      actor_type: ActorType.SYSTEM,
      actor_id: "system",
      order_id: ID.orderDelivered,
      source_app: SourceApp.BACKEND,
      payload: { external_id: "ext_seed_delivered_002", provider: "pix" },
      occurred_at: confirmed_at,
    },
    {
      id: ID.audit04,
      event_type: AuditEventType.ORDER_CONFIRMED,
      actor_type: ActorType.SYSTEM,
      actor_id: "system",
      order_id: ID.orderDelivered,
      source_app: SourceApp.BACKEND,
      payload: { status: "CONFIRMED" },
      occurred_at: confirmed_at,
    },
    {
      id: ID.audit05,
      event_type: AuditEventType.DEPOSIT_HELD,
      actor_type: ActorType.SYSTEM,
      actor_id: "system",
      order_id: ID.orderDelivered,
      source_app: SourceApp.BACKEND,
      payload: { deposit_id: ID.depositDelivered, amount_cents: 2000 },
      occurred_at: confirmed_at,
    },
    {
      id: ID.audit06,
      event_type: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
      actor_type: ActorType.DISTRIBUTOR_USER,
      actor_id: ID.adminUser,
      order_id: ID.orderDelivered,
      source_app: SourceApp.DISTRIBUTOR_WEB,
      payload: { distributor_id: ID.distributor },
      occurred_at: confirmed_at,
    },
    {
      id: ID.audit07,
      event_type: AuditEventType.ORDER_DISPATCHED,
      actor_type: ActorType.DRIVER,
      actor_id: ID.driver,
      order_id: ID.orderDelivered,
      source_app: SourceApp.DRIVER_WEB,
      payload: { driver_id: ID.driver },
      occurred_at: dispatched_at,
    },
    {
      id: ID.audit08,
      event_type: AuditEventType.OTP_GENERATED,
      actor_type: ActorType.SYSTEM,
      actor_id: "system",
      order_id: ID.orderDelivered,
      source_app: SourceApp.BACKEND,
      payload: { otp_id: ID.otpDelivered },
      occurred_at: dispatched_at,
    },
    {
      id: ID.audit09,
      event_type: AuditEventType.ORDER_DELIVERED,
      actor_type: ActorType.DRIVER,
      actor_id: ID.driver,
      order_id: ID.orderDelivered,
      source_app: SourceApp.DRIVER_WEB,
      payload: { qty_sent: 2, qty_returned: 2, bottle_condition: "good" },
      occurred_at: delivered_at,
    },
    {
      id: ID.audit10,
      event_type: AuditEventType.DEPOSIT_REFUNDED,
      actor_type: ActorType.SYSTEM,
      actor_id: "system",
      order_id: ID.orderDelivered,
      source_app: SourceApp.BACKEND,
      payload: { deposit_id: ID.depositDelivered, amount_cents: 2000 },
      occurred_at: delivered_at,
    },
  ];

  for (const ev of auditEvents) {
    await prisma.auditEvent.upsert({
      where: { id: ev.id },
      update: {},
      create: ev,
    });
  }
  console.log("✅ [18] Auditoria: 10 eventos — ciclo completo do pedido DELIVERED");

  // ─── 19. Banners promocionais ────────────────────────────────
  const banners = [
    {
      id: ID.bannerCarousel1,
      type: BannerType.CAROUSEL,
      title: "Primeira compra?\nR$ 10 OFF!",
      subtitle: "Use o cupom:",
      tag: "OFERTA DE BOAS-VINDAS",
      highlight: "XUAFRESH",
      bg_gradient_from: "#0041c8",
      bg_gradient_to: "#0055ff",
      bg_image_url: "/images/banner-welcome.webp",
      sort_order: 0,
    },
    {
      id: ID.bannerCarousel2,
      type: BannerType.CAROUSEL,
      title: "Pedidos acima\nde R$ 50",
      subtitle: "Aproveite agora!",
      tag: "FRETE GRÁTIS",
      bg_gradient_from: "#0041c8",
      bg_gradient_to: "#0055ff",
      sort_order: 1,
    },
    {
      id: ID.bannerCarousel3,
      type: BannerType.CAROUSEL,
      title: "Economize até\n15% todo mês",
      subtitle: "Água sem preocupação",
      tag: "ASSINATURA",
      bg_gradient_from: "#0041c8",
      bg_gradient_to: "#0055ff",
      cta_text: "Assinar",
      cta_url: "/subscription/manage",
      sort_order: 2,
    },
    {
      id: ID.bannerFeatured,
      type: BannerType.FEATURED,
      title: "Bomba Elétrica USB",
      subtitle: "Praticidade para o seu galão sem esforço.",
      tag: "Novo",
      cta_text: "Conferir agora",
      cta_url: "/catalog",
      bg_color: "#f3f4f5",
      text_color: "#191c1d",
      sort_order: 0,
    },
  ];

  for (const banner of banners) {
    await prisma.banner.upsert({
      where: { id: banner.id },
      update: {},
      create: banner,
    });
  }
  console.log("✅ [19] Banners: 3 carousel + 1 featured");

  // ─── Resumo final ──────────────────────────────────────────────
  console.log("\n🎉 Seed completo! Todas as 19 tabelas populadas.");
  console.log("──────────────────────────────────────────────────");
  console.log("  Produtos    : Galão 20L (imagem) + Garrafão 10L");
  console.log("  Usuários    : joao, maria, admin, driver, ops, support (senha: senha123)");
  console.log("  Endereços   : João (Centro) + Maria (Consolação)");
  console.log("  Pedidos     : CONFIRMED · DELIVERED · CANCELLED · OUT_FOR_DELIVERY · CREATED · SENT_TO_DISTRIBUTOR");
  console.log("  Pagamentos  : CAPTURED×4 · REFUNDED×1 · FAILED×1");
  console.log("  Depósitos   : HELD×2 · REFUNDED×1");
  console.log("  OTPs        : ACTIVE (código 731524) · USED (código 482910)");
  console.log("  Assinaturas : ACTIVE · PAUSED · CANCELLED");
  console.log("  Reconciliação: delta 0 (ontem)");
  console.log("  Auditoria   : 10 eventos do ciclo de vida do pedido entregue");
  console.log("  Banners     : 3 carousel + 1 featured");
  console.log("──────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

