-- Comprovante de venda e entrega (SEM valor fiscal).
--
-- 1. Dados do emitente em "03_mst_distributors": todos opcionais, porque as
--    distribuidoras existentes não têm esses dados. O comprovante usa `name`
--    como fallback da razão social enquanto o cadastro não for completado.
-- 2. `next_receipt_number`: contador da sequência por distribuidora,
--    incrementado com UPDATE … RETURNING na transação que emite o comprovante
--    (lock só na linha da distribuidora). A unique (distributor_id, number)
--    em "39_trn_sales_receipts" é a garantia final contra número repetido.
-- 3. Tabela "39_trn_sales_receipts": um comprovante por pedido, com snapshot
--    imutável dos dados no momento da emissão.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "audit_event_type" ADD VALUE 'RECEIPT_ISSUED';
ALTER TYPE "audit_event_type" ADD VALUE 'RECEIPT_PRINTED';

-- AlterTable
ALTER TABLE "03_mst_distributors" ADD COLUMN     "city" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "next_receipt_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "state_registration" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "trade_name" TEXT,
ADD COLUMN     "zip_code" TEXT;

-- CreateTable
CREATE TABLE "39_trn_sales_receipts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "distributor_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NON_FISCAL',
    "snapshot" JSONB NOT NULL,
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "issued_by_actor_type" "actor_type" NOT NULL,
    "issued_by_actor_id" TEXT,
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "last_printed_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "39_trn_sales_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "39_trn_sales_receipts_order_id_key" ON "39_trn_sales_receipts"("order_id");

-- CreateIndex
CREATE INDEX "39_trn_sales_receipts_distributor_issued_idx" ON "39_trn_sales_receipts"("distributor_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "39_trn_sales_receipts_distributor_number_key" ON "39_trn_sales_receipts"("distributor_id", "number");

-- AddForeignKey
ALTER TABLE "39_trn_sales_receipts" ADD CONSTRAINT "39_trn_sales_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "09_trn_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "39_trn_sales_receipts" ADD CONSTRAINT "39_trn_sales_receipts_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "03_mst_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

