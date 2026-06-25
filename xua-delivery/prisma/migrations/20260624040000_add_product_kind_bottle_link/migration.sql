-- CreateEnum
CREATE TYPE "product_kind" AS ENUM ('water', 'bottle', 'other');

-- AlterTable
ALTER TABLE "06_mst_products" ADD COLUMN "kind" "product_kind" NOT NULL DEFAULT 'other';
ALTER TABLE "06_mst_products" ADD COLUMN "bottle_product_id" UUID;

-- CreateIndex
CREATE INDEX "06_mst_products_bottle_product_id_idx" ON "06_mst_products"("bottle_product_id");

-- AddForeignKey
ALTER TABLE "06_mst_products" ADD CONSTRAINT "06_mst_products_bottle_product_id_fkey" FOREIGN KEY ("bottle_product_id") REFERENCES "06_mst_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
