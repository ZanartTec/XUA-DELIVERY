/**
 * Seed ISOLADO da caução de vasilhames (para teste).
 *
 * Idempotente e NÃO destrutivo: configura apenas o necessário para exercitar a
 * caução, sem tocar no restante dos dados.
 *
 * O que faz:
 *  1. Garante um produto VASILHAME (kind=BOTTLE) + item de estoque vendável.
 *  2. Vincula as águas existentes (kind=WATER) a esse vasilhame.
 *  3. Define um CPF no consumidor de teste (se faltar) e o habilita no programa.
 *  4. Dá saldo de estoque ao vasilhame e às águas (p/ venda/caução funcionarem).
 *
 * Uso (a partir da raiz, com DATABASE_URL no ambiente):
 *   DATABASE_URL="..." npx tsx prisma/seed-caucao.ts
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, InventoryItemType, ProductKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ── Parâmetros (ajuste se quiser) ───────────────────────────────
const TEST_CONSUMER_EMAIL = "joao@xua.com.br"; // consumidor a habilitar na caução
const TEST_CONSUMER_DOCUMENT = "39053344705"; // CPF válido (só dígitos)
const MAX_BOTTLES = 6; // limite de vasilhames caucionados
const BOTTLE_PRICE_CENTS = 2000; // preço de venda do vasilhame
const STOCK_QTY = 100; // saldo inicial de estoque p/ teste
const WATER_NAME_REGEX = /[áa]gua|gal[ãa]o|garraf[ãa]o|20l|10l/i;

async function main() {
  console.log("🌱 Seed de caução (isolado)…");

  // 1) Distribuidora alvo (prefere a que tem consumidores; senão a 1ª ativa).
  const consumer = await prisma.consumer.findUnique({ where: { email: TEST_CONSUMER_EMAIL } });
  if (!consumer) {
    throw new Error(
      `Consumidor ${TEST_CONSUMER_EMAIL} não encontrado. Rode o seed principal ou ajuste TEST_CONSUMER_EMAIL.`,
    );
  }
  const distributor =
    (consumer.preferred_distributor_id
      ? await prisma.distributor.findUnique({ where: { id: consumer.preferred_distributor_id } })
      : null) ?? (await prisma.distributor.findFirst({ where: { is_active: true } }));
  if (!distributor) throw new Error("Nenhuma distribuidora ativa encontrada.");
  console.log(`   Distribuidora: ${distributor.name}`);
  console.log(`   Consumidor:    ${consumer.name}`);

  // 2) Produto VASILHAME (kind=BOTTLE) — find-or-create por nome.
  let bottle = await prisma.product.findFirst({ where: { kind: ProductKind.BOTTLE } });
  if (!bottle) {
    bottle = await prisma.product.findFirst({ where: { name: "Vasilhame 20L" } });
  }
  if (!bottle) {
    bottle = await prisma.product.create({
      data: {
        name: "Vasilhame 20L",
        description: "Garrafão retornável de 20L (vasilhame).",
        price_cents: BOTTLE_PRICE_CENTS,
        kind: ProductKind.BOTTLE,
        is_active: true,
      },
    });
    console.log(`   ✅ Produto vasilhame criado: ${bottle.name}`);
  } else {
    bottle = await prisma.product.update({
      where: { id: bottle.id },
      data: { kind: ProductKind.BOTTLE },
    });
    console.log(`   ↻ Produto vasilhame existente: ${bottle.name}`);
  }

  // 3) Item de estoque vendável do vasilhame — find-or-create.
  let bottleItem = await prisma.inventoryItem.findFirst({ where: { product_id: bottle.id } });
  if (!bottleItem) {
    const code = `BOTTLE20L-${bottle.id.slice(0, 8)}`;
    bottleItem = await prisma.inventoryItem.create({
      data: {
        code,
        name: "Vasilhame 20L (vendável)",
        type: InventoryItemType.SELLABLE_PRODUCT,
        product_id: bottle.id,
        unit_label: "un",
        low_stock_threshold: 10,
        is_active: true,
      },
    });
    console.log(`   ✅ Item de estoque do vasilhame criado: ${bottleItem.code}`);
  } else {
    console.log(`   ↻ Item de estoque do vasilhame existente: ${bottleItem.code}`);
  }

  // 4) Vincula águas → vasilhame (kind=WATER + bottle_product_id).
  const candidateWaters = await prisma.product.findMany({
    where: { id: { not: bottle.id }, kind: { not: ProductKind.BOTTLE } },
  });
  const waters = candidateWaters.filter((p) => WATER_NAME_REGEX.test(p.name));
  for (const w of waters) {
    await prisma.product.update({
      where: { id: w.id },
      data: { kind: ProductKind.WATER, bottle_product_id: bottle.id },
    });
  }
  console.log(`   ✅ Águas vinculadas ao vasilhame: ${waters.map((w) => w.name).join(", ") || "(nenhuma)"}`);

  // 5) Documento + habilitação no programa de caução.
  if (!consumer.document) {
    await prisma.consumer.update({
      where: { id: consumer.id },
      data: { document: TEST_CONSUMER_DOCUMENT },
    });
    console.log(`   ✅ CPF definido para ${consumer.name}`);
  }
  const documentSnapshot = consumer.document ?? TEST_CONSUMER_DOCUMENT;

  await prisma.consumerDepositProgram.upsert({
    where: {
      distributor_id_consumer_id: { distributor_id: distributor.id, consumer_id: consumer.id },
    },
    update: {
      is_enabled: true,
      max_bottles: MAX_BOTTLES,
      consumer_document_snapshot: documentSnapshot,
      enabled_by: "seed-caucao",
      disabled_by: null,
      disabled_at: null,
    },
    create: {
      distributor_id: distributor.id,
      consumer_id: consumer.id,
      consumer_document_snapshot: documentSnapshot,
      is_enabled: true,
      max_bottles: MAX_BOTTLES,
      enabled_by: "seed-caucao",
    },
  });
  console.log(`   ✅ Programa de caução habilitado (limite ${MAX_BOTTLES})`);

  // 6) Saldo de estoque (vasilhame + águas vendáveis) p/ a distribuidora.
  const sellableItems = await prisma.inventoryItem.findMany({
    where: {
      is_active: true,
      OR: [
        { id: bottleItem.id },
        { type: InventoryItemType.SELLABLE_PRODUCT, product_id: { in: waters.map((w) => w.id) } },
      ],
    },
  });
  for (const item of sellableItems) {
    await prisma.distributorInventoryBalance.upsert({
      where: {
        distributor_id_inventory_item_id: {
          distributor_id: distributor.id,
          inventory_item_id: item.id,
        },
      },
      update: { quantity_on_hand: STOCK_QTY, last_movement_at: new Date() },
      create: {
        distributor_id: distributor.id,
        inventory_item_id: item.id,
        quantity_on_hand: STOCK_QTY,
        last_movement_at: new Date(),
      },
    });
  }
  console.log(`   ✅ Saldo de estoque (${STOCK_QTY}) p/ ${sellableItems.length} item(ns) vendável(is)`);

  console.log("\n✅ Caução pronta para teste:");
  console.log(`   • Consumidor habilitado: ${consumer.name} (CPF ${documentSnapshot}) na ${distributor.name}`);
  console.log(`   • Vasilhame: ${bottle.name} (R$ ${(bottle.price_cents / 100).toFixed(2)})`);
  console.log(`   • Águas vinculadas: ${waters.length}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed de caução:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
