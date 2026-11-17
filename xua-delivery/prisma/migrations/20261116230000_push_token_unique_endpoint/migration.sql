-- Web Push (Fase 5 do tempo real): um endpoint pertence a um único usuário.
--
-- 1) Remove duplicatas por endpoint, mantendo a linha mais recente. É a única
--    operação destrutiva: antes do deploy, contar com
--      SELECT count(*) - count(DISTINCT endpoint) FROM "08_sec_consumer_push_tokens";
--    (dev em 16/11/2026: 0 duplicatas em 1 token).
DELETE FROM "08_sec_consumer_push_tokens" t
USING "08_sec_consumer_push_tokens" newer
WHERE t.endpoint = newer.endpoint
  AND (t.created_at, t.id) < (newer.created_at, newer.id);

-- 2) Colunas de diagnóstico.
ALTER TABLE "08_sec_consumer_push_tokens" ADD COLUMN "user_agent" TEXT;
ALTER TABLE "08_sec_consumer_push_tokens" ADD COLUMN "last_success_at" TIMESTAMP(3);

-- 3) Unicidade por endpoint (o subscribe vira upsert) e busca por usuário.
CREATE UNIQUE INDEX "08_sec_consumer_push_tokens_endpoint_key" ON "08_sec_consumer_push_tokens"("endpoint");
CREATE INDEX "08_sec_consumer_push_tokens_consumer_id_idx" ON "08_sec_consumer_push_tokens"("consumer_id");
