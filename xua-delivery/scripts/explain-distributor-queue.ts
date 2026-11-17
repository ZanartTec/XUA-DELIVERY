/**
 * EXPLAIN (ANALYZE) das queries da fila do distribuidor com volume realista.
 *
 * Semeia um banco LOCAL com uma distribuidora grande (histórico longo, poucos pedidos ativos) e
 * outras menores, roda a lista, o quadro e o resumo do repositório de verdade, captura o SQL que o
 * Prisma gerou e mostra o plano de cada um. Serve para conferir se os índices de `09_trn_orders`
 * são usados quando o histórico cresce.
 *
 *   docker run -d --name xua-test-pg -e POSTGRES_USER=xua -e POSTGRES_PASSWORD=xua_test \
 *     -e POSTGRES_DB=xua_test -p 127.0.0.1:5440:5432 postgres:16
 *   DATABASE_URL=postgresql://xua:xua_test@localhost:5440/xua_test npx prisma migrate deploy
 *   DATABASE_URL=postgresql://xua:xua_test@localhost:5440/xua_test npx tsx scripts/explain-distributor-queue.ts
 *
 * Apaga as tabelas antes de semear: por isso só roda em localhost.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { OrderStatus } from "@xua/shared/enums";
import { orderRepository } from "../apps/api/src/modules/orders/repository/orders.repository.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL apontando para um Postgres local.");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Recusado: ${host} não é local. Este script apaga as tabelas antes de semear.`);
}

const BIG_DISTRIBUTOR_ORDERS = Number(process.env.EXPLAIN_BIG_ORDERS ?? 150_000);
const OTHER_DISTRIBUTORS = 30;
const OTHER_ORDERS_EACH = 3_000;

const queries: Array<{ sql: string; params: unknown[] }> = [];
const client = new pg.Client({ connectionString: url });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  log: [{ emit: "event", level: "query" }],
});
prisma.$on("query" as never, (event: { query: string; params: string }) => {
  queries.push({ sql: event.query, params: JSON.parse(event.params) as unknown[] });
});

async function seed() {
  await client.query(`
    DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'
      LOOP EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t); END LOOP;
    END $$;`);

  const { id: product } = await prisma.product.create({
    data: { name: "Agua 20L", price_cents: 1200, kind: "OTHER", is_active: true },
  });

  const distributors: string[] = [];
  for (let i = 0; i <= OTHER_DISTRIBUTORS; i++) {
    const d = await prisma.distributor.create({
      data: { name: `Dist ${i}`, cnpj: String(10_000_000_000_000 + i), phone: "11999999999", email: `d${i}@t.local`, is_active: true },
    });
    const zone = await prisma.zone.create({ data: { distributor_id: d.id, name: `Zona ${i}`, is_active: true } });
    const consumer = await prisma.consumer.create({
      data: {
        name: `Cliente ${i}`, email: `c${i}@t.local`, phone: "11988887777", document: String(20_000_000_000 + i),
        password_hash: "x", role: "CONSUMER", is_active: true,
      },
    });
    const address = await prisma.address.create({
      data: {
        consumer_id: consumer.id, street: "Rua A", number: "1", neighborhood: "Centro", city: "Juiz de Fora",
        state: "MG", zip_code: "36000000", zone_id: zone.id, is_default: true,
      },
    });
    const total = i === 0 ? BIG_DISTRIBUTOR_ORDERS : OTHER_ORDERS_EACH;
    // 3% ativos (espalhados nas 4 etapas, entrega de ontem a +3 dias), 3% cancelados, o resto entregue ao longo de 1 ano.
    await client.query(
      `INSERT INTO "09_trn_orders"
         (id, consumer_id, address_id, distributor_id, zone_id, status, delivery_date, delivery_window, total_cents, created_at, updated_at)
       SELECT gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid,
         CASE
           WHEN n % 100 < 1 THEN 'SENT_TO_DISTRIBUTOR'
           WHEN n % 100 < 2 THEN 'ACCEPTED_BY_DISTRIBUTOR'
           WHEN n % 100 < 3 THEN 'READY_FOR_DISPATCH'
           WHEN n % 100 < 4 THEN 'OUT_FOR_DELIVERY'
           WHEN n % 100 < 7 THEN 'CANCELLED'
           ELSE 'DELIVERED' END::order_status,
         CASE WHEN n % 100 < 4 THEN (current_date - 1 + (n % 5))::date
              ELSE (current_date - (n % 365) - 5)::date END,
         'morning'::delivery_window, 2400,
         now() - (n || ' minutes')::interval, now()
       FROM generate_series(1, $5::int) AS n`,
      [consumer.id, address.id, d.id, zone.id, total]
    );
    distributors.push(d.id);
  }

  await client.query(
    `INSERT INTO "10_trn_order_items" (id, order_id, product_id, product_name, unit_price_cents, quantity, subtotal_cents)
     SELECT gen_random_uuid(), o.id, $1::uuid, 'Agua 20L', 1200, 2, 2400
     FROM "09_trn_orders" o WHERE o.status NOT IN ('DELIVERED','CANCELLED')`,
    [product]
  );
  await client.query("ANALYZE");
  return distributors[0];
}

async function explain(label: string) {
  const captured = queries.splice(0);
  console.log(`\n=== ${label} — ${captured.length} consulta(s) ===`);
  for (const { sql, params } of captured) {
    if (!/FROM "public"\."09_trn_orders"|FROM "public"\."10_trn_order_items"/.test(sql)) continue;
    const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, SUMMARY ON) ${sql}`, params);
    const text = rows.map((r) => r["QUERY PLAN"] as string);
    const head = sql.replace(/"public"\./g, "").replace(/\s+/g, " ").slice(0, 150);
    console.log(`\n-- ${head}…`);
    console.log(text.filter((l) => !/^\s*(Buffers|Planning Time)/.test(l) || /Execution|Planning/.test(l)).join("\n"));
  }
}

async function main() {
  await client.connect();
  const bigId = await seed();
  const rows = await client.query(`SELECT count(*)::int AS n FROM "09_trn_orders"`);
  console.log(`Semeado: ${rows.rows[0].n} pedidos; distribuidora grande = ${bigId}`);

  const ACTIVE = [
    OrderStatus.SENT_TO_DISTRIBUTOR,
    OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    OrderStatus.READY_FOR_DISPATCH,
    OrderStatus.OUT_FOR_DELIVERY,
  ];
  const tx = prisma as never;
  queries.length = 0;

  await orderRepository.findByDistributorPaged(
    bigId,
    { statuses: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR], summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "created_desc" },
    tx
  );
  await explain("lista: etapa ativa, created_desc");

  await orderRepository.findByDistributorPaged(
    bigId,
    { statuses: [OrderStatus.DELIVERED], summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "created_desc" },
    tx
  );
  await explain("lista: histórico (DELIVERED), created_desc");

  await orderRepository.findByDistributorPaged(
    bigId,
    { statuses: ACTIVE, summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "delivery_asc" },
    tx
  );
  await explain("lista: todas as ativas, delivery_asc");

  await orderRepository.findDistributorBoard(
    bigId,
    {
      columns: {
        incoming: [OrderStatus.SENT_TO_DISTRIBUTOR],
        preparation: [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH],
        route: [OrderStatus.OUT_FOR_DELIVERY],
      },
      summaryStatuses: ACTIVE,
      perColumn: 12,
      sort: "created_desc",
    },
    tx
  );
  await explain("quadro (3 colunas + resumo)");

  await orderRepository.countDistributorQueue(bigId, ACTIVE, tx);
  await explain("resumo leve (badge do menu)");

  await orderRepository.findByDistributorPaged(
    bigId,
    { statuses: ACTIVE, summaryStatuses: ACTIVE, page: 1, limit: 30, sort: "created_desc", q: "agua" },
    tx
  );
  await explain("lista com busca q=agua (ILIKE)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
    await prisma.$disconnect();
  });
