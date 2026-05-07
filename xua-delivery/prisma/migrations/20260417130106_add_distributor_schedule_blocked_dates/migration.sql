-- CreateTable
CREATE TABLE "22_cfg_distributor_schedule" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "lead_time_hours" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "22_cfg_distributor_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "23_cfg_distributor_blocked_dates" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "blocked_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "23_cfg_distributor_blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "22_cfg_distributor_schedule_distributor_id_weekday_key" ON "22_cfg_distributor_schedule"("distributor_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "23_cfg_distributor_blocked_dates_distributor_id_blocked_dat_key" ON "23_cfg_distributor_blocked_dates"("distributor_id", "blocked_date");

-- AddForeignKey
ALTER TABLE "22_cfg_distributor_schedule" ADD CONSTRAINT "22_cfg_distributor_schedule_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "23_cfg_distributor_blocked_dates" ADD CONSTRAINT "23_cfg_distributor_blocked_dates_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
