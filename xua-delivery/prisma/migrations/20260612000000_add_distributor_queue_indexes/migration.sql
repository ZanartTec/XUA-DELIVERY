CREATE INDEX "09_trn_orders_distributor_status_created_idx"
ON "09_trn_orders"("distributor_id", "status", "created_at");

CREATE INDEX "09_trn_orders_distributor_delivery_status_idx"
ON "09_trn_orders"("distributor_id", "delivery_date", "status");

CREATE INDEX "09_trn_orders_distributor_driver_status_idx"
ON "09_trn_orders"("distributor_id", "driver_id", "status");
