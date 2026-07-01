-- Índice parcial para acelerar o cálculo de AVG(nps_score) por distribuidora
-- Usado na subquery de findAvailableForZone em distributor.repository.ts.
-- O Seq Scan na tabela inteira de pedidos (09_trn_orders) era o gargalo
-- principal que causava 18-20s de latência no endpoint /api/distributors.
--
-- Com este índice o Postgres pode satisfazer a aggregação AVG(nps_score)
-- percorrendo apenas as entradas indexadas (distributor_id, nps_score)
-- sem ler os rows completos (heap-only via index-only scan).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "09_trn_orders_distributor_nps_idx"
  ON "09_trn_orders" ("distributor_id", "nps_score")
  WHERE "nps_score" IS NOT NULL;
