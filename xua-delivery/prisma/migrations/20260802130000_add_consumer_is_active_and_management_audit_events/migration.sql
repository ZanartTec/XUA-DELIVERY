-- AlterTable
-- Permite desativar contas gerenciadas (motorista, admin de distribuidora) sem
-- excluir o registro. Hoje esses cadastros só existiam via SQL manual em produção
-- (prisma/production/seed_distributor_sao_luiz_jf_users.sql); o CRUD de
-- Distribuidor/Motorista passa a usar este campo. Default true preserva o
-- comportamento atual de todas as contas existentes (nenhuma fica bloqueada).
-- Sem efeito no login até a checagem correspondente ser adicionada em
-- auth.service.ts (fora do escopo desta migration).
ALTER TABLE "01_mst_consumers"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterEnum
-- Novos eventos de auditoria para o CRUD de Distribuidor/Motorista (fim do
-- cadastro via SQL manual). Aditivo e retrocompatível: não usa os novos valores
-- neste migration.
ALTER TYPE "audit_event_type" ADD VALUE 'DISTRIBUTOR_CREATED';
ALTER TYPE "audit_event_type" ADD VALUE 'DISTRIBUTOR_UPDATED';
ALTER TYPE "audit_event_type" ADD VALUE 'DRIVER_CREATED';
ALTER TYPE "audit_event_type" ADD VALUE 'DRIVER_UPDATED';
ALTER TYPE "audit_event_type" ADD VALUE 'DRIVER_LINKED_TO_DISTRIBUTOR';
