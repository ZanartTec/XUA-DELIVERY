import { getPrisma } from "../infra/prisma/client.js";

/**
 * Esvazia todas as tabelas de aplicação entre testes de integração (mais
 * rápido que recriar o banco). Descobre as tabelas dinamicamente para não
 * exigir manutenção a cada model novo no schema.
 *
 * Reusa o client singleton de infra/prisma/client.ts — o mesmo que os
 * repositories usam via getPrisma() quando nenhum `tx` é passado — então
 * exercitar `zonesRepository.xxx()` sem `tx` num teste de integração já bate
 * neste banco de teste, desde que DATABASE_URL aponte pra ele.
 */
export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const quoted = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}
