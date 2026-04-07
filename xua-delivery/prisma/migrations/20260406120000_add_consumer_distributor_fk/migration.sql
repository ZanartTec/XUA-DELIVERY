-- AlterTable: add optional distributor_id FK to consumers
ALTER TABLE "01_mst_consumers" ADD COLUMN "distributor_id" UUID;

-- AddForeignKey
ALTER TABLE "01_mst_consumers"
  ADD CONSTRAINT "01_mst_consumers_distributor_id_fkey"
  FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
