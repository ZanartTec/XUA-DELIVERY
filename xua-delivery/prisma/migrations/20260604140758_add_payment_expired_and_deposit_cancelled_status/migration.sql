-- AlterEnum
ALTER TYPE "audit_event_type" ADD VALUE 'PAYMENT_EXPIRED';

-- AlterEnum
ALTER TYPE "deposit_status" ADD VALUE 'cancelled';

-- AlterEnum
ALTER TYPE "payment_status" ADD VALUE 'expired';

-- RenameForeignKey
ALTER TABLE "33_trn_inventory_reconciliation_items" RENAME CONSTRAINT "33_trn_inventory_reconciliation_items_adjustment_movement_id_fk" TO "33_trn_inventory_reconciliation_items_adjustment_movement__fkey";

-- RenameIndex
ALTER INDEX "17_trn_reconciliations_date_id_idx" RENAME TO "17_trn_reconciliations_reconciliation_date_id_idx";

-- RenameIndex
ALTER INDEX "17_trn_reconciliations_distributor_date_id_idx" RENAME TO "17_trn_reconciliations_distributor_id_reconciliation_date_i_idx";

-- RenameIndex
ALTER INDEX "30_trn_distributor_inventory_balances_distributor_item_key" RENAME TO "30_trn_distributor_inventory_balances_distributor_id_invent_key";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_distributor_item_occurred_at_idx" RENAME TO "31_trn_inventory_movements_distributor_id_inventory_item_id_idx";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_distributor_occurred_at_idx" RENAME TO "31_trn_inventory_movements_distributor_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_distributor_type_occurred_at_idx" RENAME TO "31_trn_inventory_movements_distributor_id_movement_type_occ_idx";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_idempotency_key" RENAME TO "31_trn_inventory_movements_distributor_id_inventory_item_id_key";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_inventory_item_occurred_at_idx" RENAME TO "31_trn_inventory_movements_inventory_item_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_inventory_item_type_occurred_at_idx" RENAME TO "31_trn_inventory_movements_inventory_item_id_movement_type__idx";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_reference_idx" RENAME TO "31_trn_inventory_movements_reference_type_reference_id_idx";

-- RenameIndex
ALTER INDEX "31_trn_inventory_movements_type_occurred_at_idx" RENAME TO "31_trn_inventory_movements_movement_type_occurred_at_idx";

-- RenameIndex
ALTER INDEX "32_trn_inventory_reconciliation_sessions_distributor_opened_at_" RENAME TO "32_trn_inventory_reconciliation_sessions_distributor_id_ope_idx";

-- RenameIndex
ALTER INDEX "32_trn_inventory_reconciliation_sessions_distributor_status_idx" RENAME TO "32_trn_inventory_reconciliation_sessions_distributor_id_sta_idx";

-- RenameIndex
ALTER INDEX "33_trn_inventory_reconciliation_items_adjustment_movement_id_ke" RENAME TO "33_trn_inventory_reconciliation_items_adjustment_movement_i_key";

-- RenameIndex
ALTER INDEX "33_trn_inventory_reconciliation_items_session_item_key" RENAME TO "33_trn_inventory_reconciliation_items_session_id_inventory__key";
