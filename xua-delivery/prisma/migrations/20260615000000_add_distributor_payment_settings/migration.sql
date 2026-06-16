-- CreateTable
CREATE TABLE "34_cfg_distributor_payment_settings" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "accepts_pix_online" BOOLEAN NOT NULL DEFAULT false,
    "accepts_credit_online" BOOLEAN NOT NULL DEFAULT false,
    "accepts_cash_on_delivery" BOOLEAN NOT NULL DEFAULT true,
    "accepts_card_on_delivery" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'mercadopago',
    "mp_access_token_enc" TEXT,
    "mp_webhook_secret_enc" TEXT,
    "mp_public_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "34_cfg_distributor_payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "34_cfg_distributor_payment_settings_distributor_id_key" ON "34_cfg_distributor_payment_settings"("distributor_id");

-- AddForeignKey
ALTER TABLE "34_cfg_distributor_payment_settings" ADD CONSTRAINT "34_cfg_distributor_payment_settings_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "14_cfg_payment_webhook_events" ADD COLUMN "distributor_id" UUID;
