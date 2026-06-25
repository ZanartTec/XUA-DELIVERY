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
  DepositStatus,
  InventoryItemType,
  ProductKind,
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

// ─── IDs fixos para idempotência ───────────────────────────────
const ID = {
  // Produtos
  product20l:        "00000000-0000-4000-a000-000000000001",
  product10l:        "00000000-0000-4000-a000-000000000002",
  productBottle20l:  "00000000-0000-4000-a000-000000000003",

  // Categorias
  categoryMineral:   "00000000-0000-4000-a000-000000002001",
  categoryGallons:   "00000000-0000-4000-a000-000000002002",
  categoryAccessories: "00000000-0000-4000-a000-000000002003",
  categoryPremium:   "00000000-0000-4000-a000-000000002004",

  // Itens de estoque
  inventorySellable20l: "00000000-0000-4000-a000-000000001201",
  inventorySellable10l: "00000000-0000-4000-a000-000000001202",
  inventoryEmpty20l:    "00000000-0000-4000-a000-000000001203",
  inventoryBottle20l:   "00000000-0000-4000-a000-000000001204",

  // Distribuidoras
  distributor:       "00000000-0000-4000-a000-000000000010",  // Xuá JF (principal)
  distributor2:      "00000000-0000-4000-a000-000000000011",  // ÁguaFácil JF

  // Zonas (Distribuidor 1 — Xuá JF)
  zoneCentroJF:      "00000000-0000-4000-a000-000000000020",
  zoneNorteJF:       "00000000-0000-4000-a000-000000000022",
  zoneSulJF:         "00000000-0000-4000-a000-000000000023",

  // Zona (Distribuidor 2 — ÁguaFácil)
  zoneCentroJF2:     "00000000-0000-4000-a000-000000000021",

  // ZoneCoverage — Distribuidor 1
  cov_centro:        "00000000-0000-4000-a000-000000000030",
  cov_granbery:      "00000000-0000-4000-a000-000000000031",
  cov_bairro_novo:   "00000000-0000-4000-a000-000000000032",
  cov_santa_helena:  "00000000-0000-4000-a000-000000000033",
  cov_benfica:       "00000000-0000-4000-a000-000000000034",
  cov_sao_mateus:    "00000000-0000-4000-a000-000000000035",
  cov_cascatinha:    "00000000-0000-4000-a000-000000000036",
  cov_sao_pedro:     "00000000-0000-4000-a000-000000000037",
  cov_borboleta:     "00000000-0000-4000-a000-000000000038",
  cov_ipiranga:      "00000000-0000-4000-a000-000000000039",

  // ZoneCoverage — Distribuidor 2 (cobre Centro também → aparece no seletor)
  cov2_centro:       "00000000-0000-4000-a000-000000000040",
  cov2_granbery:     "00000000-0000-4000-a000-000000000041",

  // Usuários
  consumer:          "00000000-0000-4000-a000-000000000100",
  consumer2:         "00000000-0000-4000-a000-000000000105",
  adminUser:         "00000000-0000-4000-a000-000000000101",
  adminUser2:        "00000000-0000-4000-a000-000000000106",
  driver:            "00000000-0000-4000-a000-000000000102",
  opsUser:           "00000000-0000-4000-a000-000000000103",
  supportUser:       "00000000-0000-4000-a000-000000000104",

  // Endereços
  address:           "00000000-0000-4000-a000-000000000200",  // João — Centro JF
  address2:          "00000000-0000-4000-a000-000000000201",  // Maria — Benfica JF

  // TimeSlots — Distribuidor 1
  slotManha1:        "00000000-0000-4000-a000-000000000c01",
  slotTarde1:        "00000000-0000-4000-a000-000000000c02",

  // TimeSlots — Distribuidor 2
  slotManha2:        "00000000-0000-4000-a000-000000000c03",
  slotTarde2:        "00000000-0000-4000-a000-000000000c04",

  // Pedidos
  orderConfirmed:    "00000000-0000-4000-a000-000000000300",
  orderDelivered:    "00000000-0000-4000-a000-000000000301",
  orderCancelled:    "00000000-0000-4000-a000-000000000302",
  orderOutDelivery:  "00000000-0000-4000-a000-000000000303",
  orderCreated:      "00000000-0000-4000-a000-000000000304",
  orderSentToDist:   "00000000-0000-4000-a000-000000000305",

  // Itens de pedido
  item1:             "00000000-0000-4000-a000-000000000400",
  item2:             "00000000-0000-4000-a000-000000000401",
  item3:             "00000000-0000-4000-a000-000000000402",
  item4:             "00000000-0000-4000-a000-000000000403",
  item5:             "00000000-0000-4000-a000-000000000404",
  item6:             "00000000-0000-4000-a000-000000000405",

  // Pagamentos
  paymentConfirmed:  "00000000-0000-4000-a000-000000000500",
  paymentDelivered:  "00000000-0000-4000-a000-000000000501",
  paymentCancelled:  "00000000-0000-4000-a000-000000000502",
  paymentFailed:     "00000000-0000-4000-a000-000000000503",
  paymentOutDelivery:"00000000-0000-4000-a000-000000000504",
  paymentSentToDist: "00000000-0000-4000-a000-000000000505",

  // Depósitos
  depositConfirmed:  "00000000-0000-4000-a000-000000000600",
  depositDelivered:  "00000000-0000-4000-a000-000000000601",
  depositOutDelivery:"00000000-0000-4000-a000-000000000602",

  // OTPs
  otpDelivered:      "00000000-0000-4000-a000-000000000700",
  otpOutDelivery:    "00000000-0000-4000-a000-000000000701",

  // Reconciliação
  reconciliation:    "00000000-0000-4000-a000-000000000900",

  // Push token
  pushToken:         "00000000-0000-4000-a000-000000000a00",

  // Webhook
  webhookEvent:      "00000000-0000-4000-a000-000000000b00",

  // Audit events
  audit01: "00000000-0000-4000-a000-000000001001",
  audit02: "00000000-0000-4000-a000-000000001002",
  audit03: "00000000-0000-4000-a000-000000001003",
  audit04: "00000000-0000-4000-a000-000000001004",
  audit05: "00000000-0000-4000-a000-000000001005",
  audit06: "00000000-0000-4000-a000-000000001006",
  audit07: "00000000-0000-4000-a000-000000001007",
  audit08: "00000000-0000-4000-a000-000000001008",
  audit09: "00000000-0000-4000-a000-000000001009",
  audit10: "00000000-0000-4000-a000-000000001010",

  // Banners
  bannerCarousel1: "00000000-0000-4000-a000-000000001101",
  bannerCarousel2: "00000000-0000-4000-a000-000000001102",
  bannerCarousel3: "00000000-0000-4000-a000-000000001103",
  bannerFeatured:  "00000000-0000-4000-a000-000000001104",
};

function futureDate(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pastDate(offsetDays: number): Date {
  return futureDate(-offsetDays);
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 12);

  // ════════════════════════════════════════════════════════════════
  // DISTRIBUIDORAS
  // ════════════════════════════════════════════════════════════════
  await prisma.distributor.upsert({
    where: { id: ID.distributor },
    update: { name: "Distribuidora Xuá JF", allows_consumer_choice: true },
    create: {
      id: ID.distributor,
      name: "Distribuidora Xuá JF",
      cnpj: "12.345.678/0001-99",
      phone: "(32) 99123-4567",
      email: "contato@xuajf.com.br",
      acceptance_sla_seconds: 300,
      is_active: true,
      allows_consumer_choice: true,
    },
  });

  await prisma.distributor.upsert({
    where: { id: ID.distributor2 },
    update: { name: "Distribuidora ÁguaFácil JF", allows_consumer_choice: true },
    create: {
      id: ID.distributor2,
      name: "Distribuidora ÁguaFácil JF",
      cnpj: "98.765.432/0001-11",
      phone: "(32) 98765-4321",
      email: "contato@aguafaciljf.com.br",
      acceptance_sla_seconds: 600,
      is_active: true,
      allows_consumer_choice: true,
    },
  });
  console.log("✅ Distribuidoras: Xuá JF + ÁguaFácil JF");

  // ════════════════════════════════════════════════════════════════
  // USUÁRIOS
  // ════════════════════════════════════════════════════════════════
  const users = [
    { id: ID.consumer,     name: "João da Silva",      email: "joao@xua.com.br",    role: ConsumerRole.CONSUMER,          phone: "(32) 99001-1001", document: "39053344705" },
    { id: ID.consumer2,    name: "Maria Fernandes",    email: "maria@xua.com.br",   role: ConsumerRole.CONSUMER,          phone: "(32) 99001-1006", document: "11144477735" },
    { id: ID.adminUser,    name: "Ana Distribuidora",  email: "admin@xua.com.br",   role: ConsumerRole.DISTRIBUTOR_ADMIN, phone: "(32) 99001-1002", distributor_id: ID.distributor },
    { id: ID.adminUser2,   name: "Bruno ÁguaFácil",    email: "admin2@xua.com.br",  role: ConsumerRole.DISTRIBUTOR_ADMIN, phone: "(32) 99001-1007", distributor_id: ID.distributor2 },
    { id: ID.driver,       name: "Carlos Motorista",   email: "driver@xua.com.br",  role: ConsumerRole.DRIVER,            phone: "(32) 99001-1003", distributor_id: ID.distributor },
    { id: ID.opsUser,      name: "Fernanda Ops",       email: "ops@xua.com.br",     role: ConsumerRole.OPS,               phone: "(32) 99001-1004" },
    { id: ID.supportUser,  name: "Pedro Suporte",      email: "support@xua.com.br", role: ConsumerRole.SUPPORT,           phone: "(32) 99001-1005" },
  ];
  for (const u of users) {
    const { document: _doc, ...rest } = u as typeof u & { document?: string };
    const document = (u as any).document ?? null;
    await prisma.consumer.upsert({
      where: { id: u.id },
      update: { name: u.name, email: u.email, phone: u.phone ?? null, role: u.role, distributor_id: (u as any).distributor_id ?? null, document },
      create: { ...rest, password_hash: passwordHash, document },
    });
  }

  // Programa de caução: João habilitado na distribuidora Xuá JF (limite 6).
  await prisma.consumerDepositProgram.upsert({
    where: { distributor_id_consumer_id: { distributor_id: ID.distributor, consumer_id: ID.consumer } },
    update: { is_enabled: true, max_bottles: 6, consumer_document_snapshot: "39053344705", enabled_by: ID.adminUser },
    create: {
      distributor_id: ID.distributor,
      consumer_id: ID.consumer,
      consumer_document_snapshot: "39053344705",
      is_enabled: true,
      max_bottles: 6,
      enabled_by: ID.adminUser,
    },
  });
  console.log("✅ Usuários: joao, maria, admin, admin2, driver, ops, support — senha: senha123");

  // ════════════════════════════════════════════════════════════════
  // ZONAS — Juiz de Fora
  // Distribuidor 1 (Xuá JF): Centro, Norte, Sul
  // Distribuidor 2 (ÁguaFácil): Centro
  // ════════════════════════════════════════════════════════════════
  const zones = [
    { id: ID.zoneCentroJF,  distributor_id: ID.distributor,  name: "JF — Centro" },
    { id: ID.zoneNorteJF,   distributor_id: ID.distributor,  name: "JF — Norte" },
    { id: ID.zoneSulJF,     distributor_id: ID.distributor,  name: "JF — Sul" },
    { id: ID.zoneCentroJF2, distributor_id: ID.distributor2, name: "JF — Centro (ÁguaFácil)" },
  ];
  for (const z of zones) {
    await prisma.zone.upsert({ where: { id: z.id }, update: {}, create: { ...z, is_active: true } });
  }
  console.log("✅ Zonas: Centro, Norte, Sul (Xuá JF) + Centro (ÁguaFácil)");

  // ════════════════════════════════════════════════════════════════
  // ZONE COVERAGE — bairros reais de Juiz de Fora
  // ════════════════════════════════════════════════════════════════
  const coverages = [
    // Zona Centro JF (Distribuidor 1)
    { id: ID.cov_centro,       zone_id: ID.zoneCentroJF,  neighborhood: "Centro",        zip_code: "36010-000" },
    { id: ID.cov_granbery,     zone_id: ID.zoneCentroJF,  neighborhood: "Granbery",      zip_code: "36035-000" },
    { id: ID.cov_bairro_novo,  zone_id: ID.zoneCentroJF,  neighborhood: "Bairro Novo",   zip_code: "36021-000" },
    { id: ID.cov_santa_helena, zone_id: ID.zoneCentroJF,  neighborhood: "Santa Helena",  zip_code: "36015-000" },
    // Zona Norte JF (Distribuidor 1)
    { id: ID.cov_benfica,      zone_id: ID.zoneNorteJF,   neighborhood: "Benfica",       zip_code: "36025-000" },
    { id: ID.cov_sao_mateus,   zone_id: ID.zoneNorteJF,   neighborhood: "São Mateus",    zip_code: "36050-000" },
    { id: ID.cov_cascatinha,   zone_id: ID.zoneNorteJF,   neighborhood: "Cascatinha",    zip_code: "36033-000" },
    // Zona Sul JF (Distribuidor 1)
    { id: ID.cov_sao_pedro,    zone_id: ID.zoneSulJF,     neighborhood: "São Pedro",     zip_code: "36040-000" },
    { id: ID.cov_borboleta,    zone_id: ID.zoneSulJF,     neighborhood: "Borboleta",     zip_code: "36038-000" },
    { id: ID.cov_ipiranga,     zone_id: ID.zoneSulJF,     neighborhood: "Ipiranga",      zip_code: "36060-000" },
    // Zona Centro JF (Distribuidor 2 — cobre as mesmas áreas → ambos aparecem no seletor)
    { id: ID.cov2_centro,      zone_id: ID.zoneCentroJF2, neighborhood: "Centro",        zip_code: "36010-000" },
    { id: ID.cov2_granbery,    zone_id: ID.zoneCentroJF2, neighborhood: "Granbery",      zip_code: "36035-000" },
  ];
  for (const cov of coverages) {
    await prisma.zoneCoverage.upsert({ where: { id: cov.id }, update: {}, create: cov });
  }
  console.log("✅ Coberturas: 10 bairros de JF distribuídos nas zonas");

  // ════════════════════════════════════════════════════════════════
  // ENDEREÇOS (após zonas existirem)
  // ════════════════════════════════════════════════════════════════
  await prisma.address.upsert({
    where: { id: ID.address },
    update: { zone_id: ID.zoneCentroJF },
    create: {
      id: ID.address,
      consumer_id: ID.consumer,
      zone_id: ID.zoneCentroJF,
      label: "Casa",
      street: "Rua Halfeld",
      number: "450",
      complement: "Apto 302",
      neighborhood: "Centro",
      city: "Juiz de Fora",
      state: "MG",
      zip_code: "36010-000",
      is_default: true,
    },
  });
  await prisma.address.upsert({
    where: { id: ID.address2 },
    update: { zone_id: ID.zoneNorteJF },
    create: {
      id: ID.address2,
      consumer_id: ID.consumer2,
      zone_id: ID.zoneNorteJF,
      label: "Apartamento",
      street: "Rua Benjamin Constant",
      number: "890",
      complement: null,
      neighborhood: "Benfica",
      city: "Juiz de Fora",
      state: "MG",
      zip_code: "36025-000",
      is_default: true,
    },
  });
  console.log("✅ Endereços: João (Centro JF, Rua Halfeld), Maria (Benfica JF)");

  // ════════════════════════════════════════════════════════════════
  // PRODUTOS
  // ════════════════════════════════════════════════════════════════
  const products = [
    // Vasilhame (BOTTLE) — produto próprio, vendido quando faltam vazios e usado em caução.
    {
      id: ID.productBottle20l,
      name: "Vasilhame 20L",
      description: "Garrafão retornável de 20L (vasilhame).",
      image_url: null,
      price_cents: 2000,
      deposit_cents: 0,
      kind: ProductKind.BOTTLE,
      bottle_product_id: null,
      is_active: true,
    },
    {
      id: ID.product20l,
      name: "Galão de Água 20L",
      description: "Água mineral natural purificada, 20 litros. Retornável.",
      image_url: null,
      price_cents: 2500,
      deposit_cents: 1000,
      kind: ProductKind.WATER,
      bottle_product_id: ID.productBottle20l,
      is_active: true,
    },
    {
      id: ID.product10l,
      name: "Garrafão de Água 10L",
      description: "Água mineral de 10 litros. Retornável.",
      image_url: null,
      price_cents: 1500,
      deposit_cents: 500,
      kind: ProductKind.WATER,
      bottle_product_id: null,
      is_active: true,
    },
  ];
  for (const p of products) {
    const { bottle_product_id, ...rest } = p;
    await prisma.product.upsert({
      where: { id: p.id },
      update: { kind: p.kind, bottle_product_id },
      create: rest,
    });
  }
  // Vínculo água→vasilhame (após ambos existirem).
  await prisma.product.update({
    where: { id: ID.product20l },
    data: { bottle_product_id: ID.productBottle20l },
  });
  console.log("✅ Produtos: Vasilhame 20L (R$20,00), Galão 20L (R$25,00), Garrafão 10L (R$15,00)");

  // ════════════════════════════════════════════════════════════════
  // CATEGORIAS
  // ════════════════════════════════════════════════════════════════
  const categories = [
    { id: ID.categoryMineral,     name: "Água Mineral",  value: "mineral",     sort_order: 0 },
    { id: ID.categoryGallons,     name: "Galões",        value: "gallons",     sort_order: 1 },
    { id: ID.categoryAccessories, name: "Acessórios",    value: "accessories", sort_order: 2 },
    { id: ID.categoryPremium,     name: "Premium",       value: "premium",     sort_order: 3 },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { name: cat.name, sort_order: cat.sort_order },
      create: cat,
    });
  }
  console.log("✅ Categorias: Água Mineral, Galões, Acessórios, Premium");

  // Associar produtos às categorias
  await prisma.product.update({
    where: { id: ID.product20l },
    data: {
      categories: {
        connect: [
          { id: ID.categoryMineral },
          { id: ID.categoryGallons },
        ],
      },
    },
  });
  await prisma.product.update({
    where: { id: ID.product10l },
    data: {
      categories: {
        connect: [
          { id: ID.categoryMineral },
          { id: ID.categoryGallons },
        ],
      },
    },
  });
  console.log("✅ Produtos associados às categorias");

  // ════════════════════════════════════════════════════════════════
  // ITENS DE ESTOQUE (catálogo do módulo de estoque)
  // ════════════════════════════════════════════════════════════════
  const inventoryItems = [
    {
      id: ID.inventorySellable20l,
      code: "WATER20L",
      name: "Água 20L (vendável)",
      type: InventoryItemType.SELLABLE_PRODUCT,
      product_id: ID.product20l,
      unit_label: "un",
      low_stock_threshold: 10,
      is_active: true,
    },
    {
      id: ID.inventorySellable10l,
      code: "WATER10L",
      name: "Água 10L (vendável)",
      type: InventoryItemType.SELLABLE_PRODUCT,
      product_id: ID.product10l,
      unit_label: "un",
      low_stock_threshold: 10,
      is_active: true,
    },
    {
      id: ID.inventoryEmpty20l,
      code: "EMPTY20L",
      name: "Vasilhame vazio 20L",
      type: InventoryItemType.RETURNABLE_EMPTY,
      product_id: null,
      unit_label: "un",
      low_stock_threshold: 5,
      is_active: true,
    },
    {
      // Item de estoque do vasilhame-produto: vendido (ORDER_ACCEPT_OUT) e
      // emprestado em caução (DEPOSIT_LOAN_OUT) a partir do mesmo saldo.
      id: ID.inventoryBottle20l,
      code: "BOTTLE20L",
      name: "Vasilhame 20L (vendável)",
      type: InventoryItemType.SELLABLE_PRODUCT,
      product_id: ID.productBottle20l,
      unit_label: "un",
      low_stock_threshold: 10,
      is_active: true,
    },
  ];

  for (const item of inventoryItems) {
    await prisma.inventoryItem.upsert({
      where: { id: item.id },
      update: {
        code: item.code,
        name: item.name,
        type: item.type,
        product_id: item.product_id,
        unit_label: item.unit_label,
        low_stock_threshold: item.low_stock_threshold,
        is_active: item.is_active,
      },
      create: item,
    });
  }
  console.log("✅ Itens de estoque: WATER20L, WATER10L, EMPTY20L");

  // ════════════════════════════════════════════════════════════════
  // DISTRIBUTOR SCHEDULE — Seg a Sex para ambas distribuidoras
  // weekday: 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  // ════════════════════════════════════════════════════════════════
  const activeWeekdays = [1, 2, 3, 4, 5]; // Seg–Sex
  const allWeekdays = [0, 1, 2, 3, 4, 5, 6];
  for (const dist of [ID.distributor, ID.distributor2]) {
    for (const weekday of allWeekdays) {
      await prisma.distributorSchedule.upsert({
        where: { distributor_id_weekday: { distributor_id: dist, weekday } },
        update: { is_active: activeWeekdays.includes(weekday) },
        create: {
          distributor_id: dist,
          weekday,
          is_active: activeWeekdays.includes(weekday),
          lead_time_hours: 2,
        },
      });
    }
  }
  console.log("✅ DistributorSchedule: Seg–Sex ativo, Sáb+Dom inativo (ambas distribuidoras)");

  // ════════════════════════════════════════════════════════════════
  // TIME SLOTS — Manhã e Tarde para ambas distribuidoras
  // ════════════════════════════════════════════════════════════════
  const timeSlots = [
    { id: ID.slotManha1, distributor_id: ID.distributor,  label: "Manhã",  start_hour: 7,  start_minute: 0, end_hour: 12, end_minute: 0, window: DeliveryWindow.MORNING,   sort_order: 0 },
    { id: ID.slotTarde1, distributor_id: ID.distributor,  label: "Tarde",  start_hour: 12, start_minute: 0, end_hour: 17, end_minute: 0, window: DeliveryWindow.AFTERNOON, sort_order: 1 },
    { id: ID.slotManha2, distributor_id: ID.distributor2, label: "Manhã",  start_hour: 8,  start_minute: 0, end_hour: 12, end_minute: 0, window: DeliveryWindow.MORNING,   sort_order: 0 },
    { id: ID.slotTarde2, distributor_id: ID.distributor2, label: "Tarde",  start_hour: 13, start_minute: 0, end_hour: 18, end_minute: 0, window: DeliveryWindow.AFTERNOON, sort_order: 1 },
  ];
  for (const ts of timeSlots) {
    await prisma.timeSlot.upsert({
      where: { id: ts.id },
      update: {},
      create: { ...ts, is_active: true },
    });
  }
  console.log("✅ TimeSlots: Manhã (7h–12h) e Tarde (12h–17h) para Xuá JF; Manhã (8h–12h) e Tarde (13h–18h) para ÁguaFácil");

  // ════════════════════════════════════════════════════════════════
  // PUSH TOKEN
  // ════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════
  // PEDIDOS (6 cenários de status — todos em JF)
  // ════════════════════════════════════════════════════════════════

  // ── 1: CONFIRMED (amanhã manhã)
  await prisma.order.upsert({
    where: { id: ID.orderConfirmed },
    update: {},
    create: {
      id: ID.orderConfirmed,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zoneCentroJF,
      status: OrderStatus.CONFIRMED,
      delivery_date: futureDate(1),
      delivery_window: DeliveryWindow.MORNING,
      time_slot_id: ID.slotManha1,
      subtotal_cents: 2500,
      deposit_cents: 1000,
      deposit_amount_cents: 1000,
      total_cents: 3500,
      accepted_at: new Date(),
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item1 },
    update: {},
    create: { id: ID.item1, order_id: ID.orderConfirmed, product_id: ID.product20l, product_name: "Galão de Água 20L", unit_price_cents: 2500, quantity: 1, subtotal_cents: 2500 },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentConfirmed },
    update: {},
    create: { id: ID.paymentConfirmed, order_id: ID.orderConfirmed, kind: PaymentKind.ORDER, status: PaymentStatus.CAPTURED, amount_cents: 3500, provider: "pix", external_id: "ext_seed_confirmed_001", paid_at: pastDate(0) },
  });
  await prisma.deposit.upsert({
    where: { id: ID.depositConfirmed },
    update: {},
    create: { id: ID.depositConfirmed, order_id: ID.orderConfirmed, consumer_id: ID.consumer, amount_cents: 1000, status: DepositStatus.HELD },
  });

  // ── 2: DELIVERED (ontem)
  await prisma.order.upsert({
    where: { id: ID.orderDelivered },
    update: {},
    create: {
      id: ID.orderDelivered,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zoneCentroJF,
      driver_id: ID.driver,
      status: OrderStatus.DELIVERED,
      delivery_date: pastDate(1),
      delivery_window: DeliveryWindow.AFTERNOON,
      time_slot_id: ID.slotTarde1,
      subtotal_cents: 5000,
      deposit_cents: 2000,
      deposit_amount_cents: 2000,
      total_cents: 7000,
      qty_20l_sent: 2,
      qty_20l_returned: 2,
      rating: 5,
      rating_comment: "Entrega excelente, pontual!",
      nps_score: 10,
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
    create: { id: ID.item2, order_id: ID.orderDelivered, product_id: ID.product20l, product_name: "Galão de Água 20L", unit_price_cents: 2500, quantity: 2, subtotal_cents: 5000 },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentDelivered },
    update: {},
    create: { id: ID.paymentDelivered, order_id: ID.orderDelivered, kind: PaymentKind.ORDER, status: PaymentStatus.CAPTURED, amount_cents: 7000, provider: "pix", external_id: "ext_seed_delivered_002", paid_at: pastDate(2) },
  });
  await prisma.deposit.upsert({
    where: { id: ID.depositDelivered },
    update: {},
    create: { id: ID.depositDelivered, order_id: ID.orderDelivered, consumer_id: ID.consumer, amount_cents: 2000, status: DepositStatus.REFUNDED, refunded_at: pastDate(1) },
  });

  // ── 3: CANCELLED
  await prisma.order.upsert({
    where: { id: ID.orderCancelled },
    update: {},
    create: {
      id: ID.orderCancelled,
      consumer_id: ID.consumer2,
      address_id: ID.address2,
      distributor_id: ID.distributor,
      zone_id: ID.zoneNorteJF,
      status: OrderStatus.CANCELLED,
      delivery_date: futureDate(2),
      delivery_window: DeliveryWindow.MORNING,
      subtotal_cents: 1500,
      deposit_cents: 500,
      deposit_amount_cents: 500,
      total_cents: 2000,
      cancellation_reason: "consumer_request",
      payment_status: "refunded",
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item3 },
    update: {},
    create: { id: ID.item3, order_id: ID.orderCancelled, product_id: ID.product10l, product_name: "Garrafão de Água 10L", unit_price_cents: 1500, quantity: 1, subtotal_cents: 1500 },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentCancelled },
    update: {},
    create: { id: ID.paymentCancelled, order_id: ID.orderCancelled, kind: PaymentKind.ORDER, status: PaymentStatus.REFUNDED, amount_cents: 2000, provider: "pix", external_id: "ext_seed_cancelled_003", paid_at: pastDate(5) },
  });

  // ── 4: OUT_FOR_DELIVERY (hoje, em rota)
  await prisma.order.upsert({
    where: { id: ID.orderOutDelivery },
    update: {},
    create: {
      id: ID.orderOutDelivery,
      consumer_id: ID.consumer2,
      address_id: ID.address2,
      distributor_id: ID.distributor,
      zone_id: ID.zoneNorteJF,
      driver_id: ID.driver,
      status: OrderStatus.OUT_FOR_DELIVERY,
      delivery_date: futureDate(0),
      delivery_window: DeliveryWindow.MORNING,
      time_slot_id: ID.slotManha1,
      subtotal_cents: 4000,
      deposit_cents: 1500,
      deposit_amount_cents: 1500,
      total_cents: 5500,
      payment_status: "paid",
      accepted_at: pastDate(0),
      dispatched_at: new Date(),
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item4 },
    update: {},
    create: { id: ID.item4, order_id: ID.orderOutDelivery, product_id: ID.product20l, product_name: "Galão de Água 20L", unit_price_cents: 2500, quantity: 1, subtotal_cents: 2500 },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item5 },
    update: {},
    create: { id: ID.item5, order_id: ID.orderOutDelivery, product_id: ID.product10l, product_name: "Garrafão de Água 10L", unit_price_cents: 1500, quantity: 1, subtotal_cents: 1500 },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentOutDelivery },
    update: {},
    create: { id: ID.paymentOutDelivery, order_id: ID.orderOutDelivery, kind: PaymentKind.ORDER, status: PaymentStatus.CAPTURED, amount_cents: 5500, provider: "pix", external_id: "ext_seed_out_004", paid_at: pastDate(0) },
  });
  await prisma.deposit.upsert({
    where: { id: ID.depositOutDelivery },
    update: {},
    create: { id: ID.depositOutDelivery, order_id: ID.orderOutDelivery, consumer_id: ID.consumer2, amount_cents: 1500, status: DepositStatus.HELD },
  });

  // ── 5: CREATED (pagamento pendente)
  await prisma.order.upsert({
    where: { id: ID.orderCreated },
    update: {},
    create: {
      id: ID.orderCreated,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zoneCentroJF,
      status: OrderStatus.CREATED,
      delivery_date: futureDate(3),
      delivery_window: DeliveryWindow.AFTERNOON,
      subtotal_cents: 2500,
      deposit_cents: 1000,
      deposit_amount_cents: 1000,
      total_cents: 3500,
    },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentFailed },
    update: {},
    create: { id: ID.paymentFailed, order_id: ID.orderCreated, kind: PaymentKind.ORDER, status: PaymentStatus.FAILED, amount_cents: 3500, provider: "pix", external_id: "ext_seed_failed_005" },
  });

  // ── 6: SENT_TO_DISTRIBUTOR
  await prisma.order.upsert({
    where: { id: ID.orderSentToDist },
    update: {},
    create: {
      id: ID.orderSentToDist,
      consumer_id: ID.consumer,
      address_id: ID.address,
      distributor_id: ID.distributor,
      zone_id: ID.zoneCentroJF,
      status: OrderStatus.SENT_TO_DISTRIBUTOR,
      delivery_date: futureDate(2),
      delivery_window: DeliveryWindow.MORNING,
      time_slot_id: ID.slotManha1,
      subtotal_cents: 2500,
      deposit_cents: 0,
      deposit_amount_cents: 0,
      total_cents: 2500,
    },
  });
  await prisma.orderItem.upsert({
    where: { id: ID.item6 },
    update: {},
    create: { id: ID.item6, order_id: ID.orderSentToDist, product_id: ID.product20l, product_name: "Galão de Água 20L", unit_price_cents: 2500, quantity: 1, subtotal_cents: 2500 },
  });
  await prisma.payment.upsert({
    where: { id: ID.paymentSentToDist },
    update: {},
    create: { id: ID.paymentSentToDist, order_id: ID.orderSentToDist, kind: PaymentKind.ORDER, status: PaymentStatus.CAPTURED, amount_cents: 2500, provider: "pix", external_id: "ext_seed_sent_006", paid_at: new Date() },
  });

  console.log("✅ Pedidos: CONFIRMED · DELIVERED · CANCELLED · OUT_FOR_DELIVERY · CREATED · SENT_TO_DISTRIBUTOR");

  // ════════════════════════════════════════════════════════════════
  // OTPs
  // ════════════════════════════════════════════════════════════════
  await prisma.orderOtp.upsert({
    where: { id: ID.otpDelivered },
    update: {},
    create: { id: ID.otpDelivered, order_id: ID.orderDelivered, otp_hash: hashOtp("482910"), status: OtpStatus.USED, attempts: 1, expires_at: pastDate(0) },
  });
  await prisma.orderOtp.upsert({
    where: { id: ID.otpOutDelivery },
    update: {},
    create: { id: ID.otpOutDelivery, order_id: ID.orderOutDelivery, otp_hash: hashOtp("731524"), status: OtpStatus.ACTIVE, attempts: 0, expires_at: futureDate(1) },
  });
  console.log("✅ OTPs: USED (código 482910), ACTIVE (código 731524)");

  // ════════════════════════════════════════════════════════════════
  // RECONCILIAÇÃO
  // ════════════════════════════════════════════════════════════════
  await prisma.reconciliation.upsert({
    where: { id: ID.reconciliation },
    update: {},
    create: { id: ID.reconciliation, distributor_id: ID.distributor, reconciliation_date: pastDate(1), full_out: 4, empty_returned: 4, delta: 0, justification: null, closed_by: ID.opsUser },
  });

  // ════════════════════════════════════════════════════════════════
  // WEBHOOK
  // ════════════════════════════════════════════════════════════════
  await prisma.paymentWebhookEvent.upsert({
    where: { id: ID.webhookEvent },
    update: {},
    create: {
      id: ID.webhookEvent,
      provider: "pix",
      provider_event_ref: "pix_webhook_seed_001",
      event_type: "payment.captured",
      payload: { amount: 3500, order_id: ID.orderConfirmed, external_id: "ext_seed_confirmed_001", status: "captured", timestamp: new Date().toISOString() },
    },
  });

  // ════════════════════════════════════════════════════════════════
  // AUDIT EVENTS (ciclo do pedido DELIVERED)
  // ════════════════════════════════════════════════════════════════
  const auditEvents = [
    { id: ID.audit01, event_type: AuditEventType.ORDER_CREATED,                  actor_type: ActorType.CONSUMER,          actor_id: ID.consumer,   order_id: ID.orderDelivered, source_app: SourceApp.CONSUMER_WEB,    payload: { status: "CREATED" },                                              occurred_at: pastDate(3) },
    { id: ID.audit02, event_type: AuditEventType.PAYMENT_CREATED,                actor_type: ActorType.SYSTEM,            actor_id: "system",      order_id: ID.orderDelivered, source_app: SourceApp.BACKEND,         payload: { payment_id: ID.paymentDelivered, amount_cents: 7000 },            occurred_at: pastDate(3) },
    { id: ID.audit03, event_type: AuditEventType.PAYMENT_CAPTURED,               actor_type: ActorType.SYSTEM,            actor_id: "system",      order_id: ID.orderDelivered, source_app: SourceApp.BACKEND,         payload: { external_id: "ext_seed_delivered_002", provider: "pix" },         occurred_at: pastDate(2) },
    { id: ID.audit04, event_type: AuditEventType.ORDER_CONFIRMED,                actor_type: ActorType.SYSTEM,            actor_id: "system",      order_id: ID.orderDelivered, source_app: SourceApp.BACKEND,         payload: { status: "CONFIRMED" },                                            occurred_at: pastDate(2) },
    { id: ID.audit05, event_type: AuditEventType.DEPOSIT_HELD,                   actor_type: ActorType.SYSTEM,            actor_id: "system",      order_id: ID.orderDelivered, source_app: SourceApp.BACKEND,         payload: { deposit_id: ID.depositDelivered, amount_cents: 2000 },            occurred_at: pastDate(2) },
    { id: ID.audit06, event_type: AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,  actor_type: ActorType.DISTRIBUTOR_USER,  actor_id: ID.adminUser,  order_id: ID.orderDelivered, source_app: SourceApp.DISTRIBUTOR_WEB, payload: { distributor_id: ID.distributor },                                  occurred_at: pastDate(2) },
    { id: ID.audit07, event_type: AuditEventType.ORDER_DISPATCHED,               actor_type: ActorType.DRIVER,            actor_id: ID.driver,     order_id: ID.orderDelivered, source_app: SourceApp.DRIVER_WEB,      payload: { driver_id: ID.driver },                                           occurred_at: pastDate(1) },
    { id: ID.audit08, event_type: AuditEventType.OTP_GENERATED,                  actor_type: ActorType.SYSTEM,            actor_id: "system",      order_id: ID.orderDelivered, source_app: SourceApp.BACKEND,         payload: { otp_id: ID.otpDelivered },                                        occurred_at: pastDate(1) },
    { id: ID.audit09, event_type: AuditEventType.ORDER_DELIVERED,                actor_type: ActorType.DRIVER,            actor_id: ID.driver,     order_id: ID.orderDelivered, source_app: SourceApp.DRIVER_WEB,      payload: { qty_sent: 2, qty_returned: 2, bottle_condition: "good" },          occurred_at: pastDate(1) },
    { id: ID.audit10, event_type: AuditEventType.DEPOSIT_REFUNDED,               actor_type: ActorType.SYSTEM,            actor_id: "system",      order_id: ID.orderDelivered, source_app: SourceApp.BACKEND,         payload: { deposit_id: ID.depositDelivered, amount_cents: 2000 },            occurred_at: pastDate(1) },
  ];
  for (const ev of auditEvents) {
    await prisma.auditEvent.upsert({ where: { id: ev.id }, update: {}, create: ev });
  }
  console.log("✅ Auditoria: 10 eventos — ciclo completo do pedido DELIVERED");

  // ════════════════════════════════════════════════════════════════
  // BANNERS
  // ════════════════════════════════════════════════════════════════
  const banners = [
    { id: ID.bannerCarousel1, type: BannerType.CAROUSEL, title: "Primeira compra?\nR$ 10 OFF!", subtitle: "Use o cupom:", tag: "OFERTA DE BOAS-VINDAS", highlight: "XUAFRESH", bg_gradient_from: "#0041c8", bg_gradient_to: "#0055ff", bg_image_url: "/images/banner-welcome.webp", sort_order: 0 },
    { id: ID.bannerCarousel2, type: BannerType.CAROUSEL, title: "Pedidos acima\nde R$ 50",     subtitle: "Aproveite agora!",       tag: "FRETE GRÁTIS", bg_gradient_from: "#0041c8", bg_gradient_to: "#0055ff", sort_order: 1 },
    { id: ID.bannerCarousel3, type: BannerType.CAROUSEL, title: "Economize até\n15% todo mês", subtitle: "Água sem preocupação", tag: "ASSINATURA",   bg_gradient_from: "#0041c8", bg_gradient_to: "#0055ff", cta_text: "Assinar", cta_url: "/subscription/manage", sort_order: 2 },
    { id: ID.bannerFeatured,  type: BannerType.FEATURED, title: "Bomba Elétrica USB",          subtitle: "Praticidade para o seu galão.", tag: "Novo", cta_text: "Conferir agora", cta_url: "/catalog", bg_color: "#f3f4f5", text_color: "#191c1d", sort_order: 0 },
  ];
  for (const b of banners) {
    await prisma.banner.upsert({ where: { id: b.id }, update: {}, create: b });
  }
  console.log("✅ Banners: 3 carousel + 1 featured");

  // ════════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ════════════════════════════════════════════════════════════════
  console.log("\n🎉 Seed completo — Juiz de Fora, MG");
  console.log("──────────────────────────────────────────────────────────────");
  console.log("  Distribuidoras  : Xuá JF + ÁguaFácil JF");
  console.log("  Zonas JF        : Centro, Norte, Sul (Xuá) + Centro (ÁguaFácil)");
  console.log("  Bairros cobertos: Centro, Granbery, Bairro Novo, Santa Helena,");
  console.log("                    Benfica, São Mateus, Cascatinha, São Pedro,");
  console.log("                    Borboleta, Ipiranga");
  console.log("  TimeSlots       : Manhã (7–12h) · Tarde (12–17h) — ambas distribuidoras");
  console.log("  Schedule        : Seg–Sex ativo · Sáb+Dom inativo");
  console.log("  Capacidade      : 30 dias × janelas + time_slots × 4 zonas");
  console.log("  Produtos        : Galão 20L · Garrafão 10L");
  console.log("  Usuários        : joao, maria, admin, admin2, driver, ops, support");
  console.log("                    (senha: senha123)");
  console.log("  Endereço João   : Rua Halfeld 450, Centro JF → Zona Centro (Xuá JF)");
  console.log("  Endereço Maria  : Rua Benjamin Constant 890, Benfica → Zona Norte (Xuá JF)");
  console.log("  Pedidos         : CONFIRMED · DELIVERED · CANCELLED · OUT_FOR_DELIVERY · CREATED · SENT_TO_DISTRIBUTOR");
  console.log("  Assinaturas     : nenhuma (criar pelo site para testar)");
  console.log("──────────────────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
