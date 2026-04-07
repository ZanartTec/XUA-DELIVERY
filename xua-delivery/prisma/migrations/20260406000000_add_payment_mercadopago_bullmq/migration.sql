-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('pending', 'processed', 'failed');

-- AlterTable: Payment — add idempotency_key column
ALTER TABLE "13_trn_payments" ADD COLUMN "idempotency_key" TEXT;

-- AlterTable: PaymentWebhookEvent — add audit/tracking columns
ALTER TABLE "14_cfg_payment_webhook_events" ADD COLUMN "raw_headers" JSONB;
ALTER TABLE "14_cfg_payment_webhook_events" ADD COLUMN "signature_valid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "14_cfg_payment_webhook_events" ADD COLUMN "processed_at" TIMESTAMP(3);
ALTER TABLE "14_cfg_payment_webhook_events" ADD COLUMN "processing_error" TEXT;
ALTER TABLE "14_cfg_payment_webhook_events" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: IdempotencyKey
CREATE TABLE "20_cfg_idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "status" "idempotency_status" NOT NULL DEFAULT 'pending',
    "locked_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "20_cfg_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PaymentTransaction
CREATE TABLE "21_trn_payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "provider_status" TEXT NOT NULL,
    "provider_response" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "21_trn_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "20_cfg_idempotency_keys_key_key" ON "20_cfg_idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "20_cfg_idempotency_keys_status_locked_at_idx" ON "20_cfg_idempotency_keys"("status", "locked_at");

-- CreateIndex
CREATE INDEX "21_trn_payment_transactions_payment_id_created_at_idx" ON "21_trn_payment_transactions"("payment_id", "created_at");

-- AddForeignKey
ALTER TABLE "21_trn_payment_transactions" ADD CONSTRAINT "21_trn_payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "13_trn_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
