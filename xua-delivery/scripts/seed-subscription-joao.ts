/**
 * Seed pontual: cria uma assinatura ATIVA para joao@xua.com.br no plano de 3 galões,
 * como se ele tivesse assinado hoje — pulando o checkout.
 *
 * Gera: UserSubscription (ACTIVE) + Payment (SUBSCRIPTION, CAPTURED) + 3
 * SubscriptionDeliveryDate (PENDING, datas úteis futuras) prontas para testar
 * pausar/retomar e a edição de data.
 *
 * Idempotente: usa IDs fixos e recria os registros a cada execução.
 *
 * Rodar:
 *   node --env-file=apps/api/.env --import tsx scripts/seed-subscription-joao.ts
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

import {
  PrismaClient,
  PaymentKind,
  PaymentStatus,
  UserSubscriptionStatus,
  DeliveryDateStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── Referências existentes (do seed base) ─────────────────────
const CONSUMER_ID = "00000000-0000-4000-a000-000000000100"; // joao@xua.com.br
const PLAN_ID = "6cd4e1a6-2b5b-4883-815e-df3642a9a59d"; // Plano mensal - 3 galões
const DISTRIBUTOR_ID = "00000000-0000-4000-a000-000000000010"; // Xuá JF
const ADDRESS_ID = "00000000-0000-4000-a000-000000000200"; // João — Centro JF
const SLOT_MORNING = "00000000-0000-4000-a000-000000000c01"; // 07h às 08h (MORNING)

// ─── IDs fixos deste seed (para idempotência) ──────────────────
const SUB_ID = "00000000-0000-4000-a000-0000000005a0";
const PAYMENT_ID = "00000000-0000-4000-a000-0000000005a1";
const DD_IDS = [
  "00000000-0000-4000-a000-0000000005b1",
  "00000000-0000-4000-a000-0000000005b2",
  "00000000-0000-4000-a000-0000000005b3",
];

/** Avança a data até cair num dia útil (seg–sex), em UTC. */
function toWeekday(d: Date): Date {
  const out = new Date(d);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) {
    out.setUTCDate(out.getUTCDate() + 1);
  }
  return out;
}

/** 3 datas úteis futuras (meia-noite UTC), espaçadas. */
function futureWeekdayDates(): Date[] {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dates: Date[] = [];
  let cursor = new Date(today);
  cursor.setUTCDate(cursor.getUTCDate() + 2); // começa daqui a 2 dias
  for (let i = 0; i < 3; i++) {
    cursor = toWeekday(cursor);
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 3); // espaça ~3 dias
  }
  return dates;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: PLAN_ID },
    include: { product: { select: { name: true } } },
  });
  if (!plan) throw new Error(`Plano ${PLAN_ID} não encontrado. Rode o seed base antes.`);

  const consumer = await prisma.consumer.findUnique({ where: { id: CONSUMER_ID } });
  if (!consumer) throw new Error("Consumidor joao@xua.com.br não encontrado. Rode o seed base.");

  const dates = futureWeekdayDates();
  const totalQuantity = plan.quantity; // 3
  const totalAmountCents = plan.unit_price_with_discount_cents * totalQuantity;
  // Distribui 1 galão por entrega (3 datas × 1 = 3 = plan.quantity)
  const perDelivery = 1;

  // ── Limpa execução anterior (idempotência) ──────────────────
  await prisma.subscriptionDeliveryDate.deleteMany({ where: { user_subscription_id: SUB_ID } });
  await prisma.payment.deleteMany({ where: { id: PAYMENT_ID } });
  await prisma.userSubscription.deleteMany({ where: { id: SUB_ID } });

  // ── Cria a assinatura ATIVA + pagamento + datas ─────────────
  await prisma.$transaction(async (tx) => {
    await tx.userSubscription.create({
      data: {
        id: SUB_ID,
        consumer_id: CONSUMER_ID,
        plan_id: PLAN_ID,
        distributor_id: DISTRIBUTOR_ID,
        address_id: ADDRESS_ID,
        total_quantity: totalQuantity,
        remaining_quantity: totalQuantity,
        start_date: dates[0],
        end_date: dates[dates.length - 1],
        status: UserSubscriptionStatus.ACTIVE,
      },
    });

    await tx.payment.create({
      data: {
        id: PAYMENT_ID,
        user_subscription_id: SUB_ID,
        kind: PaymentKind.SUBSCRIPTION,
        status: PaymentStatus.CAPTURED,
        amount_cents: totalAmountCents,
        payment_method: "pix",
        provider: "mercadopago",
        provider_payment_ref: "seed-joao-3galoes",
        external_id: "seed-joao-3galoes",
        idempotency_key: "seed-joao-3galoes",
        paid_at: new Date(),
      },
    });

    await tx.subscriptionDeliveryDate.createMany({
      data: dates.map((d, i) => ({
        id: DD_IDS[i],
        user_subscription_id: SUB_ID,
        delivery_date: d,
        time_slot_id: SLOT_MORNING,
        quantity_for_this_delivery: perDelivery,
        status: DeliveryDateStatus.PENDING,
      })),
    });
  });

  console.log("✅ Assinatura de teste criada para joao@xua.com.br");
  console.log(`   Plano        : ${plan.name} (${plan.product.name}, qtd ${totalQuantity})`);
  console.log(`   Status       : ACTIVE · pago R$ ${(totalAmountCents / 100).toFixed(2)} (CAPTURED)`);
  console.log(`   Distribuidora: Xuá JF · Endereço: Centro JF · Janela: 07h–08h (manhã)`);
  console.log(`   Entregas     : ${dates.map(isoDate).join(", ")} (todas PENDING, futuras)`);
  console.log(`   Subscription : ${SUB_ID}`);
}

main()
  .catch((err) => {
    console.error("❌ Falha no seed da assinatura:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
