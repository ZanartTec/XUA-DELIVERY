-- Garante no banco a invariante que hoje só a aplicação promete:
-- ZoneCoverage.distributor_id == Zone.distributor_id (via zone_id).
--
-- Motivo: distributor_id em 05_mst_zone_coverage é denormalizado para as
-- queries de conflito/sobreposição não precisarem de JOIN com 04_mst_zones.
-- zones.repository.ts mantém isso em sincronia hoje (createCoverage,
-- createManyCoverage, transfer), mas nada IMPEDE outro caminho de escrita —
-- e já existe pelo menos um (distributor.repository.ts lê "05_mst_zone_coverage"
-- direto via $queryRaw) — de gravar a coluna errada. Esse tipo de bug seria
-- silencioso: só se manifesta como falso-negativo de conflito de cobertura,
-- deixando duas zonas ativas da mesma distribuidora cobrirem a mesma área sem
-- o sistema perceber.
--
-- O trigger sempre RE-DERIVA distributor_id a partir de zone_id, ignorando
-- qualquer valor que a aplicação tenha enviado. Isso torna o parâmetro
-- distributor_id em createCoverage/createManyCoverage redundante (mas
-- inofensivo — o banco corrige se estiver errado), e faz de "05_mst_zone_coverage"
-- uma tabela onde essa coluna nunca pode ficar dessincronizada, não importa a
-- via de escrita.
CREATE OR REPLACE FUNCTION sync_zone_coverage_distributor_id()
RETURNS trigger AS $$
BEGIN
  SELECT z.distributor_id INTO NEW.distributor_id
  FROM "04_mst_zones" z
  WHERE z.id = NEW.zone_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_05_mst_zone_coverage_sync_distributor_id ON "05_mst_zone_coverage";

CREATE TRIGGER trg_05_mst_zone_coverage_sync_distributor_id
BEFORE INSERT OR UPDATE ON "05_mst_zone_coverage"
FOR EACH ROW
EXECUTE FUNCTION sync_zone_coverage_distributor_id();
