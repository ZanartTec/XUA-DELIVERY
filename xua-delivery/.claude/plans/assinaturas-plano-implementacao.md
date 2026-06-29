# Plano de Implementação — Feature de Assinaturas

> Checklist de execução. A **fonte da verdade** do design é
> `.claude/architecture/assinaturas-arquitetura.md`. Aqui está apenas **como** executar.
>
> Marcação: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.
> Ao fim de cada fase, atualizar `.claude/context/assinaturas-contexto.md`.

---

## Estratégia geral

3 fases. **Fase 1 e Fase 2 em commits separados** (Fase 2 tem migration de banco → rollback
isolado). Fase 3 é aditiva e independente. Nenhuma fase deve ser mesclada com outra no mesmo commit.

Ordem de prioridade: **Fase 1 (desbloqueia)** → **Fase 2 (resiliência)** → **Fase 3 (operação)**.

---

## FASE 1 — Núcleo do fluxo (sem migration)

**Objetivo:** fazer o pedido de assinatura chegar ao distribuidor de forma atômica, idempotente,
com a data correta, e impedir assinaturas presas em `PENDING_PAYMENT`. Sem mudança de schema.

**Cobre:** C1, A2, A3, A4, D1, D2, D3, D5 (com reagendamento defensivo), D6 (fila dedicada),
D9 (descontinuar cancelamento), D11, D12.

### Tarefas
- [x] **T1.1** Geração: pedido nasce `CONFIRMED` e é enviado ao distribuidor (D1).
  - `createOrderService.createPrepaidOrderInTx(tx, data)` cria o Order já `CONFIRMED` (modo
    `prepaid`, payment_status `paid`, sem registro de Payment). `sendToDistributor` é pós-commit.
- [x] **T1.2** Atomicidade + idempotência (D2): `generateOrderForDelivery` cria Order + marca
    `DeliveryDate.order_id` + `decrement` na **mesma transação**, com lock + guard `order_id IS NULL`.
  - Status interino `DELIVERED` mantido (ORDER_CREATED só na Fase 2). I6 só vale pós-Fase 2.
- [x] **T1.3** Data correta + reagendamento defensivo (D5): usa `delivery_date`; entrega vencida é
    reagendada p/ próxima data válida (`scheduleService.getAvailableDates`) em vez de gerar no passado.
- [x] **T1.4** Concorrência (D3): `lockDueDeliveryForUpdate` com `FOR UPDATE SKIP LOCKED` (raw SQL)
    dentro da transação de geração.
- [x] **T1.5** Guard de saldo: `decrement` só se `remaining > 0`; `COMPLETED` ao chegar a 0.
- [x] **T1.6** Expiração de assinatura (A4/D6): `expire-subscription.processor` + fila dedicada
    `subscription-expiration` + producer `scheduleSubscriptionExpiration`. PENDING_PAYMENT→CANCELLED,
    Payment→EXPIRED, idempotente.
  - **Wiring:** `subscriptionExpirationWorker` registrado em `worker/index.ts`.
  - **D11:** `resumePayment` re-arma a janela (remove+reagenda); processor só cancela se ainda
    `PENDING_PAYMENT`. `create()` agenda a expiração quando o pagamento não é capturado na hora.
- [x] **T1.7** Recuperação de pedido órfão (D12): `findOrphanConfirmedDeliveries` + reenvio;
    `sendToDistributor` agora é idempotente (no-op se não estiver `CONFIRMED`).
- [x] **T1.8** Comentários atualizados (`subscription-job.ts` reescrito; delega ao serviço).
- [x] **T1.9** Cancelamento removido (rota/controller/service). Frontend não consumia o endpoint
    (só usa enums) — nada a remover lá. `CANCELLED` só via expiração.

> **Testes (T1):** escritos em `expire-subscription.processor.test.ts` e
> `subscription-generation.service.test.ts`. **Não executados localmente** — o ambiente atual não
> tem `vitest`/devDeps instalados; rodam no CI (`npm install --include=dev`). Typecheck dos arquivos
> de produção passou limpo.

### Dependências
- Nenhuma externa. Reusa state machine, `confirmOrder`, `sendToDistributor`, `expire-payment` (modelo).

### Riscos
- Geração pré-paga divergir do fluxo de pedido normal (ex.: validações que assumem subtotal>0).
  Mitigar mantendo `skipPaymentMethodValidation` e total 0 já existentes.
- `FOR UPDATE SKIP LOCKED` via Prisma exige raw SQL — validar compatibilidade com a transação interativa.
- **Falha pós-commit no `sendToDistributor`** deixa pedido em `CONFIRMED` órfão. Mitigado por T1.7
  (geração reentrante + catch-up reenvia).
- **Job de expiração sem consumer registrado** (publicado e nunca processado). Mitigado por T1.6
  (registro explícito do `Worker` em `worker/index.ts`).

### Critérios de aceite
- [ ] Assinatura ativa gera, na data agendada, pedido visível ao distribuidor em `SENT_TO_DISTRIBUTOR`.
- [ ] Reexecutar o job sobre a mesma entrega não cria segundo pedido nem debita saldo de novo (I1, I3).
- [ ] Pedido criado com `delivery_date` = data agendada (não "hoje"); entrega com data passada é
    reagendada para a próxima data válida, nunca gerada no passado.
- [ ] Cancelamento de assinatura removido (rota/serviço/frontend); `CANCELLED` só via expiração.
- [ ] Assinatura `PENDING_PAYMENT` não paga é cancelada após o timeout; assinatura já `ACTIVE` é no-op.
- [ ] `resumePayment` re-arma a expiração; assinatura retomada dentro da nova janela não é cancelada (D11).
- [ ] Pedido preso em `CONFIRMED` (falha pós-commit) é reenviado pelo catch-up sem duplicar (D12/I7).
- [ ] `remaining_quantity` nunca fica negativo; `COMPLETED` apenas no zero real.
- [ ] Testes: geração feliz, idempotência (rodar 2×), entrega vencida, expiração, **re-arme da
    expiração no resume**, **concorrência (dois workers / SKIP LOCKED não duplica)**, **recuperação
    de `CONFIRMED` órfão (falha no envio pós-commit)**.

### Rollback
- Reverter o(s) commit(s) da Fase 1. Sem migration → rollback é só código.
- Pedidos eventualmente já gerados permanecem válidos (são pedidos reais confirmados).

---

## FASE 2 — Ciclo de vida completo (com migration)

**Objetivo:** separar "pedido criado" de "entrega concluída", refletir o resultado do pedido de
volta na assinatura (compensação) com teto de tentativas. Disparar geração por evento.

**Cobre:** A5, M6, M7, D4, D7, D8, D13.

### Tarefas
- [ ] **T2.1** Migration: adicionar `ORDER_CREATED` **e `FAILED`** ao enum `DeliveryDateStatus` (D8)
    + coluna `generation_attempts Int @default(0)` em `SubscriptionDeliveryDate` (D13).
- [ ] **T2.2** Geração passa a marcar `DeliveryDate` como `ORDER_CREATED` (não `DELIVERED`) e a
    incrementar `generation_attempts`.
- [ ] **T2.3** `subscriptionSettlementService` (novo): reflete resultado do pedido (D7) com teto (D13).
  - Order `DELIVERED` → DeliveryDate `DELIVERED`.
  - Order `REJECTED_BY_DISTRIBUTOR` / `DELIVERY_FAILED` / `CANCELLED`:
    - se `generation_attempts < 3` → DeliveryDate `PENDING` (re-elegível) + `remaining += qty`;
    - se `generation_attempts >= 3` → DeliveryDate `FAILED` (não re-elegível) + `remaining += qty` +
      **notificar Operação e consumidor** (push). Reverter `COMPLETED` se aplicável.
- [ ] **T2.4** Hooks de chamada: invocar o settlement dentro de `deliver-order`, `reject-order`,
    `cancel-order` e no caminho de `DELIVERY_FAILED`. Só atua se `order` tiver `subscription_delivery_date`.
- [ ] **T2.5** Geração por evento (M7/D4): no webhook handler de ativação, enfileirar job de geração
    das entregas elegíveis da assinatura (fila `internalJobs`). Esta é a prevenção principal de
    entregas vencidas (complementa o reagendamento defensivo de T1.3).
  - **Contrato do job (resolver ambiguidade publisher/consumer):** o job atual `runSubscriptionJob()`
    varre toda a base e **não aceita alvo**. Definir um payload com `subscriptionId` (novo `jobName`
    ou campo opcional no payload existente) e ajustar `internal-jobs.processor` + `runSubscriptionJob`
    para aceitar geração **direcionada** a uma assinatura. O cron continua chamando a varredura global
    (sem `subscriptionId`); o evento chama a versão direcionada. Ambos compartilham a mesma função de
    geração idempotente (D2) — sem risco de duplicação mesmo se cron e evento coincidirem.
> Nota: cancelamento de assinatura foi **descontinuado** (D9/T1.9). Não há tarefa de estorno nesta fase.

### Dependências
- **Fase 1 concluída** (a geração idempotente é a base da compensação e do evento).
- Migration aplicada antes do deploy do código que usa `ORDER_CREATED`/`FAILED`/`generation_attempts`.

### Riscos
- Migration de enum + coluna em produção: aplicar com `migrate deploy`; deploy do código só após a migration.
- Compensação criar laço (entrega re-elegível gerando pedido que falha de novo). **Mitigado** pelo
  teto de 3 tentativas → `FAILED` (D13).

### Critérios de aceite
- [ ] Entrega gerada fica `ORDER_CREATED`; só vira `DELIVERED` quando o pedido é entregue (I6).
- [ ] Pedido rejeitado/falho (< 3 tentativas) devolve a entrega para `PENDING` e recredita o saldo (I2).
- [ ] Na 3ª falha a entrega vai para `FAILED`, recredita o saldo e notifica Operação + consumidor (D13).
- [ ] Ativação gera o primeiro pedido sem esperar o cron (quando a entrega é de hoje/vencida).
- [ ] Testes: cada caminho de compensação; teto de tentativas → `FAILED` + notificação;
    ativação→geração imediata (job direcionado); **rollback da migration** sem perda de dados.

### Rollback
- Reverter commit de código. **Migration:** `ORDER_CREATED`/`FAILED`/`generation_attempts` são
  aditivos; reverter o código que os usa é seguro desde que nenhuma linha esteja nesses estados,
  ou migrar essas linhas para `PENDING` antes.
- Plano de reversão de dados: script para reverter `ORDER_CREATED`/`FAILED` → `PENDING` se necessário.

---

## FASE 3 — Operação (aditiva)

**Objetivo:** dar à Operação visibilidade e capacidade de intervenção sobre assinaturas.

**Cobre:** M8, D10.

### Tarefas
- [ ] **T3.1** Leitura: endpoints `requireRole("ops")` para listar/filtrar assinaturas e inspecionar
    `delivery_dates` + status dos pedidos vinculados.
- [ ] **T3.2** Ação "reprocessar entrega": expõe a geração idempotente da Fase 1 para uma
    `DeliveryDate` específica (botão de emergência), incluindo reset de `generation_attempts` para
    reativar uma entrega em `FAILED` quando a Operação resolver a causa raiz.
- [ ] **T3.3** Ação "pausar/retomar" pela Operação (reusa serviços existentes). **Sem** ação de
    cancelamento/estorno (descontinuado — D9).
- [ ] **T3.4** Auditoria de todas as ações ops (`ActorType.OPS`, `SourceApp.OPS_CONSOLE`).

### Dependências
- **Fases 1 e 2 concluídas** (as ações reusam geração idempotente e settlement).

### Riscos
- Exposição de ação destrutiva (cancelar/estornar) sem dupla checagem. Mitigar com confirmação +
  registro de auditoria obrigatório.

### Critérios de aceite
- [ ] Operação lista assinaturas e vê o estado de cada entrega e pedido.
- [ ] Reprocessar uma entrega travada (inclusive `FAILED`) gera o pedido sem duplicar (reusa idempotência).
- [ ] Ações de reprocessar/pausar/retomar registram auditoria com ator OPS.

### Rollback
- Reverter commit. Aditivo e isolado — sem impacto nas Fases 1/2.

---

## Pós-implementação
- [ ] Atualizar memória de projeto se a feature mudar de status.
- [ ] Revisão final de invariantes I1–I6 contra o código entregue.
