-- Integridade da cobertura de zonas.
--
-- Contexto: o schema Zod de cobertura exigia CEP de 5 dígitos, mas o banco grava
-- e o cadastro de endereço do consumidor procura no formato "#####-###"
-- (8 dígitos). Toda cobertura criada pela API/tela era dado morto: nunca casava
-- com um endereço real. Esta migration limpa o passivo e cria as garantias que
-- faltavam.

-- 1) Novos eventos de auditoria do domínio de zonas.
--    Aditivo e fora de uso nesta mesma transação (exigência do Postgres).
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'ZONE_CREATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'ZONE_UPDATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'ZONE_TRANSFERRED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'ZONE_COVERAGE_CHANGED';

-- 2) CEPs com formato inválido (o legado de 5 dígitos) viram NULL.
--    Não dá para inferir os 3 dígitos finais, e o valor nunca casou com nada —
--    manter só induziria a Ops a achar que a área está coberta. O bairro da
--    mesma linha continua valendo.
UPDATE "05_mst_zone_coverage"
SET "zip_code" = NULL
WHERE "zip_code" IS NOT NULL
  AND "zip_code" !~ '^[0-9]{5}-[0-9]{3}$';

-- 3) Linhas sem bairro E sem CEP não cobrem nada.
DELETE FROM "05_mst_zone_coverage"
WHERE "neighborhood" IS NULL AND "zip_code" IS NULL;

-- 4) Duplicatas exatas dentro da mesma zona — precisam sair antes do UNIQUE.
--    IS NOT DISTINCT FROM trata NULL = NULL como igual, que é a semântica certa
--    aqui (duas linhas "só bairro Centro" são a mesma cobertura).
DELETE FROM "05_mst_zone_coverage" a
USING "05_mst_zone_coverage" b
WHERE a."id" > b."id"
  AND a."zone_id" = b."zone_id"
  AND a."neighborhood" IS NOT DISTINCT FROM b."neighborhood"
  AND a."zip_code" IS NOT DISTINCT FROM b."zip_code";

-- 5) Rede de segurança contra duplicata exata (ex: colar a mesma lista 2x).
--    A regra de negócio real — sem sobreposição entre zonas ATIVAS da mesma
--    distribuidora, ignorando acento e caixa — atravessa linhas de zonas
--    diferentes e por isso vive em zones.service.ts.
CREATE UNIQUE INDEX IF NOT EXISTS "05_mst_zone_coverage_unique_entry"
  ON "05_mst_zone_coverage" ("zone_id", "neighborhood", "zip_code");
