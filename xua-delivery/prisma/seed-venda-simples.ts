/**
 * Seed da VENDA SIMPLES (catálogo fixo de 2 produtos, sem caução).
 *
 * Idempotente e NÃO destrutivo. Implementa a Fase 1 de
 * `.claude/plans/venda-simples-plano-implementacao.md`:
 *
 *  1. Garante os 2 produtos vendáveis simples (kind=OTHER, sem bottle_product_id):
 *     • "Água mineral 20L"            — R$ 12,00
 *     • "Água mineral 20L + galão 20L" — R$ 37,00
 *  2. Garante EXATAMENTE 1 InventoryItem ativo (SELLABLE_PRODUCT) por produto
 *     (desativa itens ativos excedentes do mesmo produto).
 *  3. Desativa produtos antigos do fluxo de caução: qualquer produto ativo com
 *     bottle_product_id preenchido e qualquer kind=BOTTLE. (Nunca edita/deleta.)
 *  4. Reporta saldos residuais de caução (ConsumerDepositBalance > 0) — apenas log.
 *  5. Cria saldo de estoque (se ainda não existir) dos 2 itens para toda
 *     distribuidora ativa. Nunca sobrescreve saldo existente.
 *
 * Uso (a partir da raiz, com DATABASE_URL no ambiente):
 *   DATABASE_URL="..." npx tsx prisma/seed-venda-simples.ts
 *   SEED_STOCK_QTY=0 para criar saldos zerados (padrão: 100, p/ ambiente de teste).
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, InventoryItemType, ProductKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const STOCK_QTY = Number(process.env.SEED_STOCK_QTY ?? 100);

const PRODUCTS = [
  {
    name: "Água mineral 20L",
    description:
      "Garrafão de água mineral 20L. É necessário ter 1 vasilhame vazio, em bom estado e dentro da validade, para entregar na troca.",
    price_cents: 1200,
    itemCodePrefix: "AGUA20L",
  },
  {
    name: "Água mineral 20L + galão 20L",
    description:
      "Garrafão de água mineral 20L com o vasilhame incluso — o galão fica com você, sem necessidade de troca.",
    price_cents: 3700,
    itemCodePrefix: "AGUA20L-GALAO",
  },
] as const;

async function ensureProduct(def: (typeof PRODUCTS)[number]) {
  let product = await prisma.product.findFirst({ where: { name: def.name } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: def.name,
        description: def.description,
        price_cents: def.price_cents,
        kind: ProductKind.OTHER,
        bottle_product_id: null,
        deposit_cents: 0,
        is_active: true,
      },
    });
    console.log(`   ✅ Produto criado: ${product.name} (R$ ${(def.price_cents / 100).toFixed(2)})`);
  } else {
    // Garante o estado alvo mesmo se o produto já existir de execução anterior.
    product = await prisma.product.update({
      where: { id: product.id },
      data: {
        price_cents: def.price_cents,
        kind: ProductKind.OTHER,
        bottle_product_id: null,
        deposit_cents: 0,
        is_active: true,
      },
    });
    console.log(`   ↻ Produto já existia (estado alvo garantido): ${product.name}`);
  }
  return product;
}

async function ensureSingleInventoryItem(productId: string, productName: string, codePrefix: string) {
  const activeItems = await prisma.inventoryItem.findMany({
    where: { product_id: productId, is_active: true },
    orderBy: { created_at: "asc" },
  });

  if (activeItems.length === 0) {
    const item = await prisma.inventoryItem.create({
      data: {
        code: `${codePrefix}-${productId.slice(0, 8)}`,
        name: `${productName} (vendável)`,
        type: InventoryItemType.SELLABLE_PRODUCT,
        product_id: productId,
        unit_label: "un",
        low_stock_threshold: 10,
        is_active: true,
      },
    });
    console.log(`   ✅ Item de estoque criado: ${item.code}`);
    return item;
  }

  // Regra dura do design: exatamente 1 item ativo por produto (aceite do distribuidor).
  const [keep, ...extras] = activeItems;
  for (const extra of extras) {
    await prisma.inventoryItem.update({ where: { id: extra.id }, data: { is_active: false } });
    console.log(`   ⚠️ Item de estoque excedente desativado: ${extra.code}`);
  }
  console.log(`   ↻ Item de estoque existente mantido: ${keep.code}`);
  return keep;
}

async function main() {
  console.log("🌱 Seed venda simples (2 produtos, sem caução)…");

  // 1–2) Produtos novos + 1 item de estoque cada.
  const items: { id: string }[] = [];
  const newProductIds: string[] = [];
  for (const def of PRODUCTS) {
    const product = await ensureProduct(def);
    newProductIds.push(product.id);
    items.push(await ensureSingleInventoryItem(product.id, product.name, def.itemCodePrefix));
  }

  // 3) Desativa produtos antigos do fluxo de caução.
  const oldProducts = await prisma.product.findMany({
    where: {
      is_active: true,
      id: { notIn: newProductIds },
      OR: [{ bottle_product_id: { not: null } }, { kind: ProductKind.BOTTLE }],
    },
  });
  for (const p of oldProducts) {
    await prisma.product.update({ where: { id: p.id }, data: { is_active: false } });
    console.log(`   🔻 Produto antigo desativado: ${p.name} (kind=${p.kind})`);
  }
  if (oldProducts.length === 0) console.log("   ↻ Nenhum produto antigo ativo para desativar.");

  // 4) Reporta saldos residuais de caução (não zera — event-sourcing; decisão manual).
  const residualBalances = await prisma.consumerDepositBalance.findMany({
    where: { bottles_on_loan: { gt: 0 } },
    select: { distributor_id: true, consumer_id: true, bottles_on_loan: true },
  });
  if (residualBalances.length > 0) {
    console.log(`   ⚠️ ${residualBalances.length} saldo(s) residual(is) de caução > 0 (avaliar manualmente):`);
    for (const b of residualBalances) {
      console.log(`      consumer=${b.consumer_id} distributor=${b.distributor_id} bottles_on_loan=${b.bottles_on_loan}`);
    }
  } else {
    console.log("   ✅ Nenhum saldo residual de caução.");
  }

  // 5) Saldo de estoque p/ toda distribuidora ativa (só cria se não existir).
  const distributors = await prisma.distributor.findMany({ where: { is_active: true } });
  let createdBalances = 0;
  for (const distributor of distributors) {
    for (const item of items) {
      const existing = await prisma.distributorInventoryBalance.findUnique({
        where: {
          distributor_id_inventory_item_id: {
            distributor_id: distributor.id,
            inventory_item_id: item.id,
          },
        },
      });
      if (!existing) {
        await prisma.distributorInventoryBalance.create({
          data: {
            distributor_id: distributor.id,
            inventory_item_id: item.id,
            quantity_on_hand: STOCK_QTY,
            last_movement_at: new Date(),
          },
        });
        createdBalances++;
      }
    }
  }
  console.log(
    `   ✅ Saldos de estoque criados: ${createdBalances} (qty=${STOCK_QTY}) em ${distributors.length} distribuidora(s); existentes preservados.`,
  );

  // Verificação final das invariantes da Fase 1.
  const activeLinked = await prisma.product.count({
    where: { is_active: true, bottle_product_id: { not: null } },
  });
  const activeCatalog = await prisma.product.findMany({
    where: { is_active: true },
    select: { name: true, price_cents: true, kind: true },
  });
  console.log("\n✅ Estado final:");
  console.log(`   • Produtos ativos com vínculo de vasilhame: ${activeLinked} (esperado: 0)`);
  console.log("   • Catálogo ativo:");
  for (const p of activeCatalog) {
    console.log(`      - ${p.name} | R$ ${(p.price_cents / 100).toFixed(2)} | ${p.kind}`);
  }
  if (activeLinked > 0) {
    console.error("❌ Invariante violada: ainda há produto ativo vinculado a vasilhame.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed venda simples:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
