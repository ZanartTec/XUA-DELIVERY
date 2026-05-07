-- Remove campo delivery_fee_cents da tabela orders.
-- Frete deixou de ser cobrado; total_cents passa a ser subtotal_cents + deposit_cents.

ALTER TABLE "09_trn_orders" DROP COLUMN "delivery_fee_cents";
