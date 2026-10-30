-- AlterTable
-- Sentinela do passo de vasilhame na entrega. Marca o instante em que o
-- motorista registrou a troca (bottle-exchange) ou o motivo de não-coleta
-- (empty-not-collected).
--
-- Por que uma coluna nova em vez de derivar dos campos existentes: a coluna
-- `collected_empty_qty` é NOT NULL DEFAULT 0, então "o motorista não registrou
-- o passo" e "o motorista registrou zero garrafão coletado" são indistinguíveis
-- nela. Qualquer guard construído sobre esse campo seria falso. `returned_empty_qty`
-- e `empty_not_collected_reason` são nulos, mas cada um cobre só metade do fluxo,
-- e depender dos dois torna a regra implícita e frágil.
--
-- Aditiva e nullable: pedidos existentes ficam com NULL, o que corretamente
-- representa "passo não registrado". Nenhum código exige a coluna nesta
-- migration — a conclusão da entrega apenas registra o caso em auditoria e log
-- (modo tolerante). O guard estrito entra em deploy separado, depois que a
-- telemetria mostrar que os apps antigos saíram de circulação.
ALTER TABLE "09_trn_orders"
  ADD COLUMN "bottle_step_recorded_at" TIMESTAMP(3);
