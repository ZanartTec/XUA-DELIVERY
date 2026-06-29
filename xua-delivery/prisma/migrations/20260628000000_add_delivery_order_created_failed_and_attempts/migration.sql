-- AlterEnum
-- Novos estados de entrega de assinatura (Fase 2):
--   order_created = pedido gerado e enviado ao distribuidor (entrega em andamento)
--   failed        = falha persistente após 3 tentativas (não re-elegível)
-- Aditivo e retrocompatível: não usa os novos valores neste migration.
ALTER TYPE "delivery_date_status" ADD VALUE 'order_created';
ALTER TYPE "delivery_date_status" ADD VALUE 'failed';

-- AlterTable
-- Contador de tentativas de geração/compensação, para o teto de 3 (Fase 2 / D13).
ALTER TABLE "28_trn_subscription_delivery_dates"
  ADD COLUMN "generation_attempts" INTEGER NOT NULL DEFAULT 0;
