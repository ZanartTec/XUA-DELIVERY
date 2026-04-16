-- AlterTable: Consumer — allow manual distributor selection
ALTER TABLE "01_mst_consumers"
  ADD COLUMN "auto_assign_distributor" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "preferred_distributor_id" UUID;

-- AlterTable: Distributor — opt-in for consumer choice
ALTER TABLE "03_mst_distributors"
  ADD COLUMN "allows_consumer_choice" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "01_mst_consumers"
  ADD CONSTRAINT "01_mst_consumers_preferred_distributor_id_fkey"
  FOREIGN KEY ("preferred_distributor_id")
  REFERENCES "03_mst_distributors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
