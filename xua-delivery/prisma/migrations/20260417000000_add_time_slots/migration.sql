-- CreateTable: TimeSlot (24_cfg_time_slots)
CREATE TABLE "24_cfg_time_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "distributor_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_hour" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL DEFAULT 0,
    "end_hour" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL DEFAULT 0,
    "window" "delivery_window" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "24_cfg_time_slots_pkey" PRIMARY KEY ("id")
);

-- AddColumn: time_slot_id to DeliveryCapacity
ALTER TABLE "07_cfg_delivery_capacity" ADD COLUMN "time_slot_id" UUID;

-- AddColumns: time_slot_id, preferred_time_start, preferred_time_end to Order
ALTER TABLE "09_trn_orders" ADD COLUMN "time_slot_id" UUID;
ALTER TABLE "09_trn_orders" ADD COLUMN "preferred_time_start" INTEGER;
ALTER TABLE "09_trn_orders" ADD COLUMN "preferred_time_end" INTEGER;

-- Drop old unique constraint on DeliveryCapacity and create new one including time_slot_id
ALTER TABLE "07_cfg_delivery_capacity" DROP CONSTRAINT IF EXISTS "07_cfg_delivery_capacity_zone_id_delivery_date_window_key";
CREATE UNIQUE INDEX "07_cfg_delivery_capacity_zone_id_delivery_date_window_time_key"
    ON "07_cfg_delivery_capacity"("zone_id", "delivery_date", "window", "time_slot_id") NULLS NOT DISTINCT;

-- AddForeignKey: TimeSlot -> Distributor
ALTER TABLE "24_cfg_time_slots" ADD CONSTRAINT "24_cfg_time_slots_distributor_id_fkey"
    FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: DeliveryCapacity -> TimeSlot
ALTER TABLE "07_cfg_delivery_capacity" ADD CONSTRAINT "07_cfg_delivery_capacity_time_slot_id_fkey"
    FOREIGN KEY ("time_slot_id") REFERENCES "24_cfg_time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Order -> TimeSlot
ALTER TABLE "09_trn_orders" ADD CONSTRAINT "09_trn_orders_time_slot_id_fkey"
    FOREIGN KEY ("time_slot_id") REFERENCES "24_cfg_time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
