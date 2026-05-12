-- Snapshot imutável do horário do pedido.
-- Desacopla histórico de Order de alterações futuras em TimeSlot.
ALTER TABLE "09_trn_orders"
    ADD COLUMN "scheduled_time_label" TEXT,
    ADD COLUMN "scheduled_time_start_hour" INTEGER,
    ADD COLUMN "scheduled_time_start_minute" INTEGER,
    ADD COLUMN "scheduled_time_end_hour" INTEGER,
    ADD COLUMN "scheduled_time_end_minute" INTEGER;
