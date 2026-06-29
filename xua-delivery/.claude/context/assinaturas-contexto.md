# Contexto — Implementação Assinaturas (para Claude Code)

> Documento curto p/ retomar a implementação em novas conversas sem reler tudo.
> **Atualizar ao FIM de cada fase.** Design completo: `.claude/architecture/assinaturas-arquitetura.md`.
> Plano/checklist: `.claude/plans/assinaturas-plano-implementacao.md`.
>
> Última atualização: 2026-06-27 · Estado: **FASE 1 IMPLEMENTADA (não commitada) — próxima: Fase 2**

## Resumo da arquitetura (1 parágrafo)
Assinatura é pré-pago online (MP na conta da distribuidora). Cada `SubscriptionDeliveryDate` vira
um `Order` pré-pago (total 0) na data agendada, que segue o fluxo normal até o distribuidor/entrega.
Geração deve ser **atômica + idempotente**, disparada por **evento** (ativação) com **cron de
catch-up**. Resultado do pedido reflete de volta na assinatura (compensação). Sem event bus:
integração por chamada direta de serviço + auditoria.

## Decisões aprovadas (D1–D12)
D1 pedido nasce `CONFIRMED` e é enviado ao distribuidor · D2 geração atômica+idempotente (guard
`order_id IS NULL`) · D3 `FOR UPDATE SKIP LOCKED` · D4 geração por evento + cron fallback ·
D5 data do pedido = `delivery_date` · D6 worker expira `PENDING_PAYMENT` · D7 compensação dentro
dos serviços de pedido · D8 novo enum `DeliveryDateStatus.ORDER_CREATED` · D9 cancel c/ estorno ·
D10 ops read+ação auditada · D11 expiração re-armada no `resumePayment` (só cancela se ainda
`PENDING_PAYMENT`) · D12 envio pós-commit com recuperação de `Order` `CONFIRMED` órfão (geração
reentrante + catch-up reenvia, sem duplicar) · **D9 cancelamento de assinatura DESCONTINUADO**
(sem estorno; `CANCELLED` só via expiração) · **D13 falha persistente após 3 tentativas →
`DeliveryDate.FAILED` + notifica ops/consumidor** (coluna `generation_attempts`).

## Decisões de negócio fechadas (pelo dono do produto)
1. Cancelamento de assinatura: **descontinuado** (remover rota/serviço/frontend).
2. Entrega vencida: **reagendar p/ próxima data válida** + projetar p/ não ocorrer (evento+cron).
3. Compensação: **teto de 3 tentativas** → `FAILED` + notificação ops/consumidor.
4. Expiração: **fila dedicada `subscription-expiration`** com Worker próprio.

## Regras de negócio importantes
- Só assinatura `ACTIVE` gera pedido. `PENDING_PAYMENT`→`ACTIVE` só por pagamento `CAPTURED`.
- Idempotência: 1 entrega ↔ 1 pedido (`SubscriptionDeliveryDate.order_id @unique`).
- `remaining_quantity` nunca negativo; `COMPLETED` só no zero real.
- Pedido de assinatura: total 0, `skipPaymentMethodValidation`, distribuidor enxerga via origem `subscription`.
- Distribuidor só vê pedidos em `SENT_TO_DISTRIBUTOR..OUT_FOR_DELIVERY`.

## Arquivos principais
- Serviço consumidor: `apps/api/src/modules/user-subscriptions/services/user-subscriptions.service.ts`
- Repositório: `apps/api/src/modules/user-subscriptions/repository/user-subscriptions.repository.ts`
- Geração (job): `apps/api/src/jobs/subscription-job.ts`
- Saldo baixo (job): `apps/api/src/jobs/subscription-expiry-job.ts`
- Criação de pedido: `apps/api/src/modules/orders/services/create-order.service.ts`
- State machine pedido: `apps/api/src/modules/orders/state-machine/order-state-machine.ts`
- Webhook (ativação): `apps/api/src/worker/processors/payment-webhook/payment-webhook.handlers.ts`
- Expiração pedido (modelo p/ D6): `apps/api/src/worker/processors/expire-payment.processor.ts`
- Agendador BullMQ: `apps/api/src/worker/register-repeatable-jobs.ts` + `worker/processors/internal-jobs.processor.ts`
- Fila distribuidor: `apps/api/src/modules/orders/services/order-query.service.ts`
- Origem assinatura no pedido: `apps/api/src/modules/orders/services/order-presentation.service.ts`
- Ops (a estender): `apps/api/src/modules/ops/*`
- Schema: `prisma/schema.prisma` (enums L18-169; models L939-1012)

### Arquivos novos/alterados na Fase 1
- NOVO `modules/user-subscriptions/services/subscription-generation.service.ts` — geração atômica,
  idempotente (lock + guard order_id), reagendamento defensivo, recuperação de órfãos.
- NOVO `worker/processors/expire-subscription.processor.ts` — expira `PENDING_PAYMENT`.
- NOVO `infra/queue/subscription-jobs.producer.ts` — `scheduleSubscriptionExpiration` (re-arma).
- ALT `modules/orders/services/create-order.service.ts` — extraído `buildOrderInTx`; novo
  `createPrepaidOrderInTx`; `sendToDistributor` idempotente.
- ALT `jobs/subscription-job.ts` — delega ao serviço de geração.
- ALT `user-subscriptions.repository.ts` — `findDueDeliveries`, `findOrphanConfirmedDeliveries`,
  `lockDueDeliveryForUpdate`.
- ALT `user-subscriptions.service.ts` — agenda/re-arma expiração; **`cancel` removido**.
- ALT `infra/queue/contracts.ts`, `worker/index.ts` — fila/worker `subscription-expiration`.
- Testes: `expire-subscription.processor.test.ts`, `subscription-generation.service.test.ts`.

## Fases concluídas
- **Fase 1 (T1.1–T1.9)** — implementada, typecheck de produção limpo. **Testes não rodados localmente**
  (ambiente sem `vitest`); rodar no CI. Ainda **não commitada**.

## Próximas tarefas
- Validar/rodar os testes da Fase 1 no CI (ou ambiente com devDeps).
- Commitar Fase 1 (commit isolado — sem migration).
- Iniciar **Fase 2 / T2.1** (migration: `ORDER_CREATED` + `FAILED` + `generation_attempts`).

## Pendências / decisões abertas
- (nenhuma) — as 4 decisões de negócio foram fechadas (ver acima). Pendências remanescentes são
  apenas de implementação, detalhadas no plano.

## Pontos de atenção (não repetir os bugs)
- **Fase 1 marca `DeliveryDate` como `DELIVERED` interino** (ORDER_CREATED só na Fase 2); I6/compensação
  só valem pós-Fase 2.
- NÃO deixar Order em `CREATED` (precisa `CONFIRMED`→`SENT_TO_DISTRIBUTOR`).
- NÃO separar criação do Order da marcação da entrega em transações distintas (dual-write).
- **`sendToDistributor` é pós-commit:** geração deve ser reentrante p/ recuperar `Order` `CONFIRMED`
  órfão (D12/T1.7) — não criar pedido novo se `order_id` já existe.
- **Worker de expiração precisa de consumer registrado** em `worker/index.ts` (T1.6) — senão job
  publicado nunca processa.
- **`resumePayment` deve re-armar a expiração** (D11) — senão pode cancelar assinatura em retomada.
- **Job de geração por evento (T2.5) precisa de payload com `subscriptionId`** — `runSubscriptionJob()`
  hoje só faz varredura global, sem alvo.
- **Cancelamento descontinuado (D9):** remover `cancel` do controller/service/rota + frontend;
  `CANCELLED` só via expiração. NÃO implementar estorno.
- **Falha persistente (D13):** Fase 2 adiciona `DeliveryDate.FAILED` + coluna `generation_attempts`;
  teto de 3 → notifica ops/consumidor. Migration aditiva.
- **Entrega vencida (D5):** reagendar p/ próxima data válida (T1.3), nunca gerar com data passada.
- Migration de enum (Fase 2): aplicar `migrate deploy` ANTES do deploy do código que usa o valor.
- Fase 1 e Fase 2 em **commits separados** (Fase 2 tem migration).
- Comentários nos jobs ainda dizem "Render Cron Job HTTP POST" — mecanismo real é BullMQ.
