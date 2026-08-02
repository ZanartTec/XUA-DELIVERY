-- Índice de suporte às agregações de KPI da OPS.
-- Todas as queries do KpiService/KpiOverviewService filtram por
-- event_type + occurred_at; o único índice existente era
-- (order_id, occurred_at), que não cobre esse acesso — a agregação
-- global cross-distribuidora fazia seq scan em 18_aud_audit_events.
--
-- Sem CONCURRENTLY: o Prisma Migrate roda dentro de uma transação
-- (ver 20260701133700_fix_nps_index_without_concurrently).

CREATE INDEX IF NOT EXISTS "18_aud_audit_events_type_occurred_idx"
  ON "18_aud_audit_events" ("event_type", "occurred_at");
