-- CreateEnum
CREATE TYPE "delivery_window" AS ENUM ('morning', 'afternoon');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('DRAFT', 'CREATED', 'PAYMENT_PENDING', 'CONFIRMED', 'SENT_TO_DISTRIBUTOR', 'ACCEPTED_BY_DISTRIBUTOR', 'REJECTED_BY_DISTRIBUTOR', 'PICKING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'REDELIVERY_SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "otp_status" AS ENUM ('active', 'used', 'expired', 'locked');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('order', 'subscription', 'deposit');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "deposit_status" AS ENUM ('held', 'refund_initiated', 'refunded', 'forfeited');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('consumer', 'distributor_user', 'driver', 'support', 'ops', 'system');

-- CreateEnum
CREATE TYPE "source_app" AS ENUM ('consumer_web', 'distributor_web', 'driver_web', 'ops_console', 'backend');

-- CreateEnum
CREATE TYPE "audit_event_type" AS ENUM ('ORDER_CREATED', 'ORDER_PRICING_FINALIZED', 'ORDER_CONFIRMED', 'ORDER_CANCELLED', 'ORDER_RECEIVED_BY_DISTRIBUTOR', 'ORDER_ACCEPTED_BY_DISTRIBUTOR', 'ORDER_REJECTED_BY_DISTRIBUTOR', 'DISPATCH_CHECKLIST_COMPLETED', 'ORDER_DISPATCHED', 'OTP_GENERATED', 'OTP_SENT', 'OTP_VALIDATION_ATTEMPTED', 'ORDER_DELIVERED', 'BOTTLE_EXCHANGE_RECORDED', 'EMPTY_NOT_COLLECTED', 'REDELIVERY_REQUIRED', 'REDELIVERY_SCHEDULED', 'PAYMENT_CREATED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'DEPOSIT_HELD', 'DEPOSIT_REFUND_INITIATED', 'DEPOSIT_REFUNDED', 'DAILY_RECONCILIATION_CLOSED');

-- CreateTable
CREATE TABLE "01_mst_consumers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'consumer',
    "is_b2b" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "01_mst_consumers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "02_mst_addresses" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "label" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "zone_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "02_mst_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "03_mst_distributors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "acceptance_sla_seconds" INTEGER NOT NULL DEFAULT 180,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "03_mst_distributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "04_mst_zones" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "04_mst_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "05_mst_zone_coverage" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "neighborhood" TEXT,
    "zip_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "05_mst_zone_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "06_mst_products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "deposit_cents" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "06_mst_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "07_cfg_delivery_capacity" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "delivery_date" DATE NOT NULL,
    "window" "delivery_window" NOT NULL,
    "capacity_total" INTEGER NOT NULL,
    "capacity_reserved" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "07_cfg_delivery_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "08_sec_consumer_push_tokens" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "08_sec_consumer_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "09_trn_orders" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "driver_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'CREATED',
    "delivery_date" DATE NOT NULL,
    "delivery_window" "delivery_window" NOT NULL,
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "deposit_cents" INTEGER NOT NULL DEFAULT 0,
    "deposit_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "qty_20l_sent" INTEGER,
    "qty_20l_returned" INTEGER,
    "rating" INTEGER,
    "rating_comment" TEXT,
    "nps_score" INTEGER,
    "nps_comment" TEXT,
    "collected_empty_qty" INTEGER NOT NULL DEFAULT 0,
    "returned_empty_qty" INTEGER,
    "bottle_condition" TEXT,
    "empty_not_collected_reason" TEXT,
    "empty_not_collected_notes" TEXT,
    "payment_status" TEXT,
    "cancellation_reason" TEXT,
    "accepted_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "09_trn_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "10_trn_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "10_trn_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "11_trn_subscriptions" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "address_id" UUID,
    "product_id" UUID,
    "distributor_id" UUID,
    "zone_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "delivery_window" "delivery_window" NOT NULL DEFAULT 'morning',
    "delivery_day_of_month" INTEGER,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "next_delivery_date" DATE,
    "qty_20l" INTEGER,
    "weekday" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "11_trn_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "12_piv_subscription_orders" (
    "subscription_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "12_piv_subscription_orders_pkey" PRIMARY KEY ("subscription_id","order_id")
);

-- CreateTable
CREATE TABLE "13_trn_payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "payment_kind" NOT NULL DEFAULT 'order',
    "status" "payment_status" NOT NULL DEFAULT 'created',
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "provider_payment_ref" TEXT,
    "external_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "13_trn_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "14_cfg_payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_ref" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "14_cfg_payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "15_trn_deposits" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "deposit_status" NOT NULL DEFAULT 'held',
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "15_trn_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "16_sec_order_otps" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "status" "otp_status" NOT NULL DEFAULT 'active',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "16_sec_order_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "17_trn_reconciliations" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "reconciliation_date" DATE NOT NULL,
    "full_out" INTEGER NOT NULL,
    "empty_returned" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "justification" TEXT,
    "closed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "17_trn_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "18_aud_audit_events" (
    "id" UUID NOT NULL,
    "event_type" "audit_event_type" NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "order_id" UUID,
    "source_app" "source_app" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "18_aud_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "01_mst_consumers_email_key" ON "01_mst_consumers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "03_mst_distributors_cnpj_key" ON "03_mst_distributors"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "07_cfg_delivery_capacity_zone_id_delivery_date_window_key" ON "07_cfg_delivery_capacity"("zone_id", "delivery_date", "window");

-- CreateIndex
CREATE UNIQUE INDEX "13_trn_payments_external_id_key" ON "13_trn_payments"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "14_cfg_payment_webhook_events_provider_provider_event_ref_key" ON "14_cfg_payment_webhook_events"("provider", "provider_event_ref");

-- AddForeignKey
ALTER TABLE "02_mst_addresses" ADD CONSTRAINT "02_mst_addresses_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "02_mst_addresses" ADD CONSTRAINT "02_mst_addresses_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "04_mst_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "04_mst_zones" ADD CONSTRAINT "04_mst_zones_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "05_mst_zone_coverage" ADD CONSTRAINT "05_mst_zone_coverage_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "04_mst_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "07_cfg_delivery_capacity" ADD CONSTRAINT "07_cfg_delivery_capacity_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "04_mst_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "08_sec_consumer_push_tokens" ADD CONSTRAINT "08_sec_consumer_push_tokens_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "09_trn_orders" ADD CONSTRAINT "09_trn_orders_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "09_trn_orders" ADD CONSTRAINT "09_trn_orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "02_mst_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "09_trn_orders" ADD CONSTRAINT "09_trn_orders_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "09_trn_orders" ADD CONSTRAINT "09_trn_orders_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "04_mst_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "10_trn_order_items" ADD CONSTRAINT "10_trn_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "10_trn_order_items" ADD CONSTRAINT "10_trn_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "06_mst_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "11_trn_subscriptions" ADD CONSTRAINT "11_trn_subscriptions_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "12_piv_subscription_orders" ADD CONSTRAINT "12_piv_subscription_orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "11_trn_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "12_piv_subscription_orders" ADD CONSTRAINT "12_piv_subscription_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "13_trn_payments" ADD CONSTRAINT "13_trn_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "15_trn_deposits" ADD CONSTRAINT "15_trn_deposits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "15_trn_deposits" ADD CONSTRAINT "15_trn_deposits_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "16_sec_order_otps" ADD CONSTRAINT "16_sec_order_otps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "17_trn_reconciliations" ADD CONSTRAINT "17_trn_reconciliations_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "18_aud_audit_events" ADD CONSTRAINT "18_aud_audit_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
