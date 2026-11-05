-- Regra de vasilhame na entrega (refil x combo) configurável por produto.
ALTER TABLE "06_mst_products" ADD COLUMN "requires_empty_return" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "06_mst_products" ADD COLUMN "base_product_id" UUID;
ALTER TABLE "06_mst_products"
  ADD CONSTRAINT "06_mst_products_base_product_id_fkey"
  FOREIGN KEY ("base_product_id") REFERENCES "06_mst_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserva o comportamento atual: água com vasilhame vinculado = refil.
UPDATE "06_mst_products"
   SET "requires_empty_return" = true
 WHERE "kind" = 'water' AND "bottle_product_id" IS NOT NULL;

ALTER TABLE "09_trn_orders" ADD COLUMN "max_bottle_charge_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "09_trn_orders" ADD COLUMN "bottle_charge_cents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "10_trn_order_items" ADD COLUMN "original_quantity" INTEGER;
