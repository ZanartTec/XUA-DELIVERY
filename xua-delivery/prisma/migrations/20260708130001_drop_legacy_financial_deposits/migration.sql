-- Caução financeira v1 — Fase 3 (passo 2/2): remoção destrutiva.
-- Exige que 20260708130000_archive_legacy_financial_deposits tenha rodado antes.
-- Mantidos de propósito: payment_kind 'deposit' e audit_event_type DEPOSIT_* (Postgres
-- não suporta DROP VALUE em enum; 18_aud_audit_events é append-only) e as colunas
-- deposit_cents/deposit_amount_cents de 09_trn_orders (histórico compõe total_cents).

-- Derruba FKs e índices junto com a tabela.
DROP TABLE "15_trn_deposits";

DROP TYPE "deposit_status";

-- Caução financeira por produto: dado morto, nenhum fluxo consome (v2 usa price_cents
-- do Product kind=BOTTLE).
ALTER TABLE "06_mst_products" DROP COLUMN "deposit_cents";
