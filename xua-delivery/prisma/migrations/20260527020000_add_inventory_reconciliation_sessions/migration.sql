CREATE TYPE "inventory_reconciliation_status" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "32_trn_inventory_reconciliation_sessions" (
  "id" UUID NOT NULL,
  "distributor_id" UUID NOT NULL,
  "status" "inventory_reconciliation_status" NOT NULL DEFAULT 'OPEN',
  "opened_by" TEXT NOT NULL,
  "closed_by" TEXT,
  "justification" TEXT,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "32_trn_inventory_reconciliation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "33_trn_inventory_reconciliation_items" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "snapshot_quantity" INTEGER NOT NULL,
  "counted_quantity" INTEGER,
  "delta" INTEGER,
  "adjustment_movement_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "33_trn_inventory_reconciliation_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "32_trn_inventory_reconciliation_sessions_open_distributor_key"
ON "32_trn_inventory_reconciliation_sessions"("distributor_id")
WHERE "status" = 'OPEN';

CREATE INDEX "32_trn_inventory_reconciliation_sessions_distributor_status_idx"
ON "32_trn_inventory_reconciliation_sessions"("distributor_id", "status");

CREATE INDEX "32_trn_inventory_reconciliation_sessions_status_opened_at_idx"
ON "32_trn_inventory_reconciliation_sessions"("status", "opened_at");

CREATE INDEX "32_trn_inventory_reconciliation_sessions_distributor_opened_at_idx"
ON "32_trn_inventory_reconciliation_sessions"("distributor_id", "opened_at");

CREATE UNIQUE INDEX "33_trn_inventory_reconciliation_items_session_item_key"
ON "33_trn_inventory_reconciliation_items"("session_id", "inventory_item_id");

CREATE INDEX "33_trn_inventory_reconciliation_items_inventory_item_id_idx"
ON "33_trn_inventory_reconciliation_items"("inventory_item_id");

CREATE UNIQUE INDEX "33_trn_inventory_reconciliation_items_adjustment_movement_id_key"
ON "33_trn_inventory_reconciliation_items"("adjustment_movement_id");

ALTER TABLE "32_trn_inventory_reconciliation_sessions"
ADD CONSTRAINT "32_trn_inventory_reconciliation_sessions_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "33_trn_inventory_reconciliation_items"
ADD CONSTRAINT "33_trn_inventory_reconciliation_items_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "32_trn_inventory_reconciliation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "33_trn_inventory_reconciliation_items"
ADD CONSTRAINT "33_trn_inventory_reconciliation_items_inventory_item_id_fkey"
FOREIGN KEY ("inventory_item_id") REFERENCES "29_mst_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "33_trn_inventory_reconciliation_items"
ADD CONSTRAINT "33_trn_inventory_reconciliation_items_adjustment_movement_id_fkey"
FOREIGN KEY ("adjustment_movement_id") REFERENCES "31_trn_inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "33_trn_inventory_reconciliation_items"
ADD CONSTRAINT "33_trn_inventory_reconciliation_items_snapshot_non_negative_check"
CHECK ("snapshot_quantity" >= 0);

ALTER TABLE "33_trn_inventory_reconciliation_items"
ADD CONSTRAINT "33_trn_inventory_reconciliation_items_counted_non_negative_check"
CHECK ("counted_quantity" IS NULL OR "counted_quantity" >= 0);

ALTER TABLE "32_trn_inventory_reconciliation_sessions"
ADD CONSTRAINT "32_trn_inventory_reconciliation_sessions_closed_consistency_check"
CHECK (
  ("status" = 'OPEN' AND "closed_at" IS NULL AND "closed_by" IS NULL)
  OR
  ("status" = 'CLOSED' AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL)
);