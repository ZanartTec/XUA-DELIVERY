-- CreateEnum
CREATE TYPE "user_subscription_status" AS ENUM ('pending_payment', 'active', 'paused', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "delivery_date_status" AS ENUM ('pending', 'delivered', 'cancelled');

-- DropForeignKey
ALTER TABLE "13_trn_payments" DROP CONSTRAINT "13_trn_payments_order_id_fkey";

-- AlterTable
ALTER TABLE "13_trn_payments" ADD COLUMN     "user_subscription_id" UUID,
ALTER COLUMN "order_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "25_cfg_subscription_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discount_percentage" INTEGER NOT NULL DEFAULT 0,
    "unit_price_with_discount_cents" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "25_cfg_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "26_piv_subscription_plan_distributors" (
    "plan_id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,

    CONSTRAINT "26_piv_subscription_plan_distributors_pkey" PRIMARY KEY ("plan_id","distributor_id")
);

-- CreateTable
CREATE TABLE "27_trn_user_subscriptions" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "total_quantity" INTEGER NOT NULL,
    "remaining_quantity" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "user_subscription_status" NOT NULL DEFAULT 'pending_payment',
    "low_balance_notification_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "27_trn_user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "28_trn_subscription_delivery_dates" (
    "id" UUID NOT NULL,
    "user_subscription_id" UUID NOT NULL,
    "delivery_date" DATE NOT NULL,
    "time_slot_id" UUID NOT NULL,
    "quantity_for_this_delivery" INTEGER NOT NULL,
    "status" "delivery_date_status" NOT NULL DEFAULT 'pending',
    "order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "28_trn_subscription_delivery_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "28_trn_subscription_delivery_dates_order_id_key" ON "28_trn_subscription_delivery_dates"("order_id");

-- AddForeignKey
ALTER TABLE "13_trn_payments" ADD CONSTRAINT "13_trn_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "13_trn_payments" ADD CONSTRAINT "13_trn_payments_user_subscription_id_fkey" FOREIGN KEY ("user_subscription_id") REFERENCES "27_trn_user_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "25_cfg_subscription_plans" ADD CONSTRAINT "25_cfg_subscription_plans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "06_mst_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "26_piv_subscription_plan_distributors" ADD CONSTRAINT "26_piv_subscription_plan_distributors_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "25_cfg_subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "26_piv_subscription_plan_distributors" ADD CONSTRAINT "26_piv_subscription_plan_distributors_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "27_trn_user_subscriptions" ADD CONSTRAINT "27_trn_user_subscriptions_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "27_trn_user_subscriptions" ADD CONSTRAINT "27_trn_user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "25_cfg_subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "27_trn_user_subscriptions" ADD CONSTRAINT "27_trn_user_subscriptions_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "27_trn_user_subscriptions" ADD CONSTRAINT "27_trn_user_subscriptions_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "02_mst_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "28_trn_subscription_delivery_dates" ADD CONSTRAINT "28_trn_subscription_delivery_dates_user_subscription_id_fkey" FOREIGN KEY ("user_subscription_id") REFERENCES "27_trn_user_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "28_trn_subscription_delivery_dates" ADD CONSTRAINT "28_trn_subscription_delivery_dates_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "24_cfg_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "28_trn_subscription_delivery_dates" ADD CONSTRAINT "28_trn_subscription_delivery_dates_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
