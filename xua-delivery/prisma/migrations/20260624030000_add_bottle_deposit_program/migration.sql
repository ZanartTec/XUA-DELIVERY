-- AlterEnum: novos movimentos de estoque para caução de vasilhames
ALTER TYPE "inventory_movement_type" ADD VALUE 'DEPOSIT_LOAN_OUT';
ALTER TYPE "inventory_movement_type" ADD VALUE 'DEPOSIT_RETURN_IN';

-- AlterEnum: novos eventos de auditoria de caução de vasilhames
ALTER TYPE "audit_event_type" ADD VALUE 'DEPOSIT_BOTTLES_LOANED';
ALTER TYPE "audit_event_type" ADD VALUE 'DEPOSIT_BOTTLES_RETURNED';
ALTER TYPE "audit_event_type" ADD VALUE 'DEPOSIT_BOTTLES_WRITTEN_OFF';
ALTER TYPE "audit_event_type" ADD VALUE 'DEPOSIT_PROGRAM_ENABLED';
ALTER TYPE "audit_event_type" ADD VALUE 'DEPOSIT_PROGRAM_DISABLED';

-- CreateEnum
CREATE TYPE "deposit_movement_type" AS ENUM ('loan_out', 'return_in', 'manual_adjustment', 'write_off');

-- AlterTable: documento (CPF/CNPJ) do consumidor
ALTER TABLE "01_mst_consumers" ADD COLUMN "document" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "01_mst_consumers_document_key" ON "01_mst_consumers"("document");

-- AlterTable: settlement de vasilhames no pedido
ALTER TABLE "09_trn_orders" ADD COLUMN "bottles_full_ordered" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "09_trn_orders" ADD COLUMN "empty_bottles_provided" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "09_trn_orders" ADD COLUMN "bottles_sold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "09_trn_orders" ADD COLUMN "bottles_loaned" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "35_cfg_consumer_deposit_programs" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "consumer_document_snapshot" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_bottles" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "enabled_by" TEXT NOT NULL,
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_by" TEXT,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "35_cfg_consumer_deposit_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "35_cfg_consumer_deposit_programs_consumer_idx" ON "35_cfg_consumer_deposit_programs"("consumer_id", "is_enabled");
CREATE INDEX "35_cfg_consumer_deposit_programs_distributor_idx" ON "35_cfg_consumer_deposit_programs"("distributor_id", "is_enabled");
CREATE UNIQUE INDEX "35_cfg_consumer_deposit_programs_distributor_consumer_key" ON "35_cfg_consumer_deposit_programs"("distributor_id", "consumer_id");

-- CreateTable
CREATE TABLE "36_trn_consumer_deposit_balances" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "bottles_on_loan" INTEGER NOT NULL DEFAULT 0,
    "last_movement_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "36_trn_consumer_deposit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "36_trn_consumer_deposit_balances_consumer_idx" ON "36_trn_consumer_deposit_balances"("consumer_id");
CREATE INDEX "36_trn_consumer_deposit_balances_distributor_idx" ON "36_trn_consumer_deposit_balances"("distributor_id");
CREATE UNIQUE INDEX "36_trn_consumer_deposit_balances_dist_consumer_item_key" ON "36_trn_consumer_deposit_balances"("distributor_id", "consumer_id", "inventory_item_id");

-- CreateTable
CREATE TABLE "37_log_consumer_deposit_movements" (
    "id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "bottles_delta" INTEGER NOT NULL,
    "movement_type" "deposit_movement_type" NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "source_app" "source_app" NOT NULL,
    "order_id" UUID,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "37_log_consumer_deposit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "37_log_consumer_deposit_movements_dist_consumer_idx" ON "37_log_consumer_deposit_movements"("distributor_id", "consumer_id", "occurred_at");
CREATE INDEX "37_log_consumer_deposit_movements_consumer_idx" ON "37_log_consumer_deposit_movements"("consumer_id", "occurred_at");
CREATE INDEX "37_log_consumer_deposit_movements_order_idx" ON "37_log_consumer_deposit_movements"("order_id");

-- AddForeignKey
ALTER TABLE "35_cfg_consumer_deposit_programs" ADD CONSTRAINT "35_cfg_consumer_deposit_programs_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "35_cfg_consumer_deposit_programs" ADD CONSTRAINT "35_cfg_consumer_deposit_programs_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "36_trn_consumer_deposit_balances" ADD CONSTRAINT "36_trn_consumer_deposit_balances_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "36_trn_consumer_deposit_balances" ADD CONSTRAINT "36_trn_consumer_deposit_balances_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "36_trn_consumer_deposit_balances" ADD CONSTRAINT "36_trn_consumer_deposit_balances_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "29_mst_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "37_log_consumer_deposit_movements" ADD CONSTRAINT "37_log_consumer_deposit_movements_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "37_log_consumer_deposit_movements" ADD CONSTRAINT "37_log_consumer_deposit_movements_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "01_mst_consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "37_log_consumer_deposit_movements" ADD CONSTRAINT "37_log_consumer_deposit_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "29_mst_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "37_log_consumer_deposit_movements" ADD CONSTRAINT "37_log_consumer_deposit_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
