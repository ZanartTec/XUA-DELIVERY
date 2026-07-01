-- Garante que o índice parcial para NPS exista.
-- A migration anterior (20260701120000) usava CREATE INDEX CONCURRENTLY,
-- que falha silenciosamente dentro de uma transação do Prisma Migrate.
-- Esta migration usa CREATE INDEX sem CONCURRENTLY para funcionar
-- corretamente dentro da transação padrão do Prisma.

CREATE INDEX IF NOT EXISTS "09_trn_orders_distributor_nps_idx"
  ON "09_trn_orders" ("distributor_id", "nps_score")
  WHERE "nps_score" IS NOT NULL;
