CREATE INDEX "17_trn_reconciliations_distributor_date_id_idx"
ON "17_trn_reconciliations"("distributor_id", "reconciliation_date", "id");

CREATE INDEX "17_trn_reconciliations_date_id_idx"
ON "17_trn_reconciliations"("reconciliation_date", "id");