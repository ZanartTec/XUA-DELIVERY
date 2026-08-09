-- Hardening de escala para zonas/cobertura, pensado para múltiplas dezenas de
-- distribuidoras (cada uma podendo ter zonas com milhares de linhas de
-- cobertura, como já é o caso de Juiz de Fora).

-- 1) Busca por substring (ILIKE '%x%') em Zone.name e ZoneCoverage.neighborhood
--    não usa índice B-tree comum. pg_trgm resolve isso via índice GIN.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() é STABLE (depende do dicionário de busca textual), e Postgres só
-- aceita função IMMUTABLE em índice funcional. O wrapper abaixo é o padrão
-- documentado para contornar isso — o dicionário de unaccent não muda em
-- runtime, então tratá-la como imutável é seguro. As queries de busca DEVEM
-- chamar esta função (não unaccent() diretamente) para o índice ser usado.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

CREATE INDEX IF NOT EXISTS "04_mst_zones_name_trgm_idx"
  ON "04_mst_zones" USING gin (immutable_unaccent(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "05_mst_zone_coverage_neighborhood_trgm_idx"
  ON "05_mst_zone_coverage" USING gin (immutable_unaccent(neighborhood) gin_trgm_ops);

-- zip_code é só dígitos e hífen — não precisa do wrapper de acento.
CREATE INDEX IF NOT EXISTS "05_mst_zone_coverage_zip_code_trgm_idx"
  ON "05_mst_zone_coverage" USING gin (zip_code gin_trgm_ops);

-- 2) Denormaliza distributor_id em ZoneCoverage.
--
--    A checagem de conflito interno (bairro/CEP já usado por outra zona da
--    MESMA distribuidora) roda a cada cobertura adicionada. Sem esta coluna,
--    ela precisa fazer JOIN com "04_mst_zones" para descobrir de quem é cada
--    linha — com esta coluna, filtra direto por índice, sem join, e o custo
--    passa a depender só do tamanho da distribuidora sendo consultada, nunca
--    do total da tabela.
--
--    Mantida em sincronia pela aplicação (zones.repository.ts): preenchida na
--    criação de cobertura e atualizada em lote quando uma zona é transferida
--    de distribuidora.
ALTER TABLE "05_mst_zone_coverage" ADD COLUMN "distributor_id" UUID;

UPDATE "05_mst_zone_coverage" zc
SET "distributor_id" = z."distributor_id"
FROM "04_mst_zones" z
WHERE z."id" = zc."zone_id";

ALTER TABLE "05_mst_zone_coverage" ALTER COLUMN "distributor_id" SET NOT NULL;

ALTER TABLE "05_mst_zone_coverage"
  ADD CONSTRAINT "05_mst_zone_coverage_distributor_id_fkey"
  FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id");

CREATE INDEX IF NOT EXISTS "05_mst_zone_coverage_distributor_id_idx"
  ON "05_mst_zone_coverage" ("distributor_id");

-- 3) Comparação EXATA de bairro para detecção de conflito (distinta da busca
--    por substring acima): minúsculas, sem acento, espaços internos
--    colapsados — mesma normalização de packages/shared/src/utils/zip.ts
--    (normalizeNeighborhood), para "São  Pedro" e "sao pedro" serem
--    tratados como o mesmo bairro dos dois lados (JS e SQL).
CREATE OR REPLACE FUNCTION normalize_neighborhood(text)
RETURNS text AS $$
  SELECT lower(trim(regexp_replace(public.unaccent('public.unaccent'::regdictionary, $1), '\s+', ' ', 'g')))
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
