-- DropIndex
DROP INDEX "07_cfg_delivery_capacity_zone_id_delivery_date_window_key";

-- AlterTable
ALTER TABLE "24_cfg_time_slots" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "07_cfg_delivery_capacity_zone_id_delivery_date_window_time_key" RENAME TO "07_cfg_delivery_capacity_zone_id_delivery_date_window_time__key";
