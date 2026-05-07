-- AlterTable
ALTER TABLE "11_trn_subscriptions"
  ADD COLUMN "time_slot_id" UUID,
  ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Backfill weekdays array from legacy single weekday column
UPDATE "11_trn_subscriptions"
   SET "weekdays" = ARRAY["weekday"]
 WHERE "weekday" IS NOT NULL
   AND ("weekdays" IS NULL OR cardinality("weekdays") = 0);

-- AddForeignKey
ALTER TABLE "11_trn_subscriptions"
  ADD CONSTRAINT "11_trn_subscriptions_time_slot_id_fkey"
  FOREIGN KEY ("time_slot_id") REFERENCES "24_cfg_time_slots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
