-- CreateIndex
CREATE INDEX "09_trn_orders_consumer_created_idx" ON "09_trn_orders"("consumer_id", "created_at");

-- CreateIndex
CREATE INDEX "10_trn_order_items_order_idx" ON "10_trn_order_items"("order_id");

-- CreateIndex
CREATE INDEX "15_trn_deposits_order_idx" ON "15_trn_deposits"("order_id");

-- CreateIndex
CREATE INDEX "15_trn_deposits_consumer_status_idx" ON "15_trn_deposits"("consumer_id", "status");

-- CreateIndex
CREATE INDEX "18_aud_audit_events_order_occurred_idx" ON "18_aud_audit_events"("order_id", "occurred_at");
