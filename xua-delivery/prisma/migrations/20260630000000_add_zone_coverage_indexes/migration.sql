-- Indexes for zone_coverage geographic lookup queries
-- These are used in findAvailableForZone and validateDistributorForZone
-- which join zone_coverage twice (cross-join by zone_id, then match by neighborhood/zip_code)

CREATE INDEX IF NOT EXISTS "05_mst_zone_coverage_zone_id_idx"
  ON "05_mst_zone_coverage" ("zone_id");

CREATE INDEX IF NOT EXISTS "05_mst_zone_coverage_zip_code_idx"
  ON "05_mst_zone_coverage" ("zip_code");

CREATE INDEX IF NOT EXISTS "05_mst_zone_coverage_neighborhood_idx"
  ON "05_mst_zone_coverage" ("neighborhood");

-- Index for zone lookup by distributor + is_active (used in the same JOIN)
CREATE INDEX IF NOT EXISTS "04_mst_zones_distributor_id_is_active_idx"
  ON "04_mst_zones" ("distributor_id", "is_active");
