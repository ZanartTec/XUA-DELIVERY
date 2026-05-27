CREATE TYPE "inventory_movement_type" AS ENUM (
  'INITIAL_LOAD',
  'ORDER_ACCEPT_OUT',
  'ORDER_CANCEL_RETURN',
  'DELIVERY_FAILED_RETURN',
  'EMPTY_RETURN_IN',
  'RECONCILIATION_ADJUSTMENT',
  'MANUAL_CORRECTION',
  'LOSS_WRITE_OFF',
  'PURCHASE_IN'
);

CREATE TYPE "inventory_reference_type" AS ENUM (
  'ORDER',
  'RECONCILIATION_SESSION',
  'INITIAL_LOAD',
  'MANUAL_ADJUSTMENT',
  'PURCHASE',
  'SYSTEM'
);

CREATE TABLE "30_trn_distributor_inventory_balances" (
  "id" UUID NOT NULL,
  "distributor_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
  "last_movement_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "30_trn_distributor_inventory_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "31_trn_inventory_movements" (
  "id" UUID NOT NULL,
  "distributor_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "movement_type" "inventory_movement_type" NOT NULL,
  "actor_type" "actor_type" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "source_app" "source_app" NOT NULL,
  "reference_type" "inventory_reference_type",
  "reference_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "31_trn_inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "30_trn_distributor_inventory_balances_distributor_item_key"
ON "30_trn_distributor_inventory_balances"("distributor_id", "inventory_item_id");

CREATE INDEX "30_trn_distributor_inventory_balances_distributor_id_idx"
ON "30_trn_distributor_inventory_balances"("distributor_id");

CREATE INDEX "30_trn_distributor_inventory_balances_inventory_item_id_idx"
ON "30_trn_distributor_inventory_balances"("inventory_item_id");

CREATE UNIQUE INDEX "31_trn_inventory_movements_idempotency_key"
ON "31_trn_inventory_movements"(
  "distributor_id",
  "inventory_item_id",
  "movement_type",
  "reference_type",
  "reference_id"
);

CREATE INDEX "31_trn_inventory_movements_distributor_occurred_at_idx"
ON "31_trn_inventory_movements"("distributor_id", "occurred_at");

CREATE INDEX "31_trn_inventory_movements_inventory_item_occurred_at_idx"
ON "31_trn_inventory_movements"("inventory_item_id", "occurred_at");

CREATE INDEX "31_trn_inventory_movements_reference_idx"
ON "31_trn_inventory_movements"("reference_type", "reference_id");

ALTER TABLE "30_trn_distributor_inventory_balances"
ADD CONSTRAINT "30_trn_distributor_inventory_balances_quantity_non_negative_check"
CHECK ("quantity_on_hand" >= 0);

ALTER TABLE "31_trn_inventory_movements"
ADD CONSTRAINT "31_trn_inventory_movements_quantity_delta_non_zero_check"
CHECK ("quantity_delta" <> 0);

ALTER TABLE "31_trn_inventory_movements"
ADD CONSTRAINT "31_trn_inventory_movements_reference_pair_check"
CHECK (
  ("reference_type" IS NULL AND "reference_id" IS NULL)
  OR ("reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
);

ALTER TABLE "30_trn_distributor_inventory_balances"
ADD CONSTRAINT "30_trn_distributor_inventory_balances_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "30_trn_distributor_inventory_balances"
ADD CONSTRAINT "30_trn_distributor_inventory_balances_inventory_item_id_fkey"
FOREIGN KEY ("inventory_item_id") REFERENCES "29_mst_inventory_items"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "31_trn_inventory_movements"
ADD CONSTRAINT "31_trn_inventory_movements_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "31_trn_inventory_movements"
ADD CONSTRAINT "31_trn_inventory_movements_inventory_item_id_fkey"
FOREIGN KEY ("inventory_item_id") REFERENCES "29_mst_inventory_items"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
