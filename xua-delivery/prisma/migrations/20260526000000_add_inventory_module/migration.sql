CREATE TYPE "inventory_item_type" AS ENUM (
  'SELLABLE_PRODUCT',
  'RETURNABLE_FULL',
  'RETURNABLE_EMPTY',
  'SUPPLY'
);

CREATE TABLE "29_mst_inventory_items" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "inventory_item_type" NOT NULL,
  "product_id" UUID,
  "unit_label" TEXT NOT NULL,
  "low_stock_threshold" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "29_mst_inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "29_mst_inventory_items_code_key" ON "29_mst_inventory_items"("code");
CREATE INDEX "29_mst_inventory_items_product_id_idx" ON "29_mst_inventory_items"("product_id");

ALTER TABLE "29_mst_inventory_items"
ADD CONSTRAINT "29_mst_inventory_items_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "06_mst_products"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;