-- Caução financeira v1 — Fase 3 (passo 1/2): arquivamento antes do drop.
-- Copia 15_trn_deposits para z_arch_15_trn_deposits (somente leitura, sem FKs),
-- com status convertido para text para desacoplar do type deposit_status.
-- Pré-condição operacional: rodar as queries de verificação (docs/doc_desenvolvimento/
-- caucao-vasilhames.md) e ter backup validado antes de aplicar em produção.

CREATE TABLE "z_arch_15_trn_deposits" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "z_arch_15_trn_deposits_pkey" PRIMARY KEY ("id")
);

INSERT INTO "z_arch_15_trn_deposits"
    ("id", "order_id", "consumer_id", "amount_cents", "status", "refunded_at", "created_at", "updated_at")
SELECT "id", "order_id", "consumer_id", "amount_cents", "status"::text, "refunded_at", "created_at", "updated_at"
FROM "15_trn_deposits";

COMMENT ON TABLE "z_arch_15_trn_deposits" IS
    'Arquivo da caução financeira v1 (15_trn_deposits), somente leitura. Arquivada em jul/2026.';
