# Arquitetura — Feature de Assinaturas (XUA Delivery)

> **Fonte da verdade.** Este documento descreve o **funcionamento final desejado** da feature
> de assinaturas após as correções. Deve permanecer estável durante a implementação.
> Mudanças de design exigem atualização explícita aqui antes do código.
>
> Status: **APROVADO PARA SER FONTE DA VERDADE** · Última revisão: 2026-06-27

---

## 1. Visão geral

Assinatura = consumidor pré-paga online (Mercado Pago, na conta da **distribuidora**) um plano com
N entregas agendadas. Cada entrega agendada (`SubscriptionDeliveryDate`) é convertida, na data
correta, em um `Order` real que percorre o fluxo normal de pedido até o distribuidor e a entrega.

Princípios de design:

1. **Pré-pago.** O pagamento ocorre uma vez, na ativação. Os pedidos gerados têm valor 0 (já pagos).
2. **Event-driven com fallback por cron.** A geração reage a eventos (ativação, conclusão de
   entrega); o cron é apenas rede de segurança / catch-up.
3. **Atômico e idempotente.** Gerar um pedido, vincular a entrega e debitar o saldo é uma única
   operação atômica, segura para reexecução.
4. **Ciclo de vida fechado.** O resultado do `Order` (entregue / rejeitado / falho) reflete de
   volta no estado da assinatura (compensação).
5. **Operável.** A Operação enxerga e intervém sem acesso direto ao banco.

---

## 2. Modelo de dados

Sem mudanças estruturais além de **um novo valor de enum** (Fase 2).

### 2.1 `UserSubscription`
`27_trn_user_subscriptions` — id, consumer_id, plan_id, distributor_id, address_id,
total_quantity, remaining_quantity, start_date, end_date, status, low_balance_notification_sent_at.

### 2.2 `SubscriptionDeliveryDate`
`28_trn_subscription_delivery_dates` — id, user_subscription_id, delivery_date, time_slot_id,
quantity_for_this_delivery, status, **order_id (`@unique`, nullable)**,
**generation_attempts (`Int @default(0)`)** [NOVO — Fase 2, suporte à decisão de retentativa].
> A `@unique` em `order_id` é a âncora de idempotência: uma entrega só pode apontar para um pedido.
> `generation_attempts` conta tentativas de geração/compensação para o teto de 3 (ver D13).

### 2.3 Enums

`UserSubscriptionStatus`: `PENDING_PAYMENT → ACTIVE → (PAUSED ⇄ ACTIVE) → COMPLETED`.
`CANCELLED` é alcançável **apenas** via expiração de pagamento (`PENDING_PAYMENT` não pago).
**Não há cancelamento de assinatura pelo consumidor** (decisão de negócio — ver D9).

`DeliveryDateStatus` (**estado final desejado** — Fase 2 adiciona `ORDER_CREATED` e `FAILED`):
```
PENDING         entrega agendada, ainda não virou pedido
ORDER_CREATED   pedido gerado e enviado ao distribuidor; entrega real em andamento  [NOVO]
DELIVERED       pedido efetivamente entregue (Order.status = DELIVERED)
FAILED          falha persistente após 3 tentativas de geração/entrega (ver D13)    [NOVO]
CANCELLED       entrega cancelada (somente via expiração da assinatura PENDING_PAYMENT)
```
> Antes da Fase 2, `DELIVERED` é (incorretamente) atribuído na geração. O estado-alvo separa
> "pedido criado" de "entrega concluída" e isola falhas persistentes em `FAILED`.

---

## 3. Máquina de estados da assinatura

| De → Para | Gatilho | Componente |
|---|---|---|
| (novo) → `PENDING_PAYMENT` | criação | `userSubscriptionsService.create` |
| `PENDING_PAYMENT` → `ACTIVE` | pagamento `CAPTURED` (webhook) ou captura síncrona | webhook handler / create |
| `PENDING_PAYMENT` → `CANCELLED` | expiração do pagamento (timeout) | **worker de expiração de assinatura (NOVO)** |
| `ACTIVE` → `PAUSED` | ação do consumidor | `pause` |
| `PAUSED` → `ACTIVE` | ação do consumidor | `resume` |
| `ACTIVE` → `COMPLETED` | `remaining_quantity` chega a 0 | geração de pedido |

Regras invioláveis:
- Nunca regride de `ACTIVE` para `PENDING_PAYMENT`.
- Apenas `ACTIVE` gera pedidos (cron e evento filtram por isso).
- `CANCELLED`/`COMPLETED` são terminais.
- **`CANCELLED` só ocorre via expiração de `PENDING_PAYMENT`.** Não existe transição de cancelamento
  a partir de `ACTIVE`/`PAUSED` (cancelamento de assinatura descontinuado — D9).

---

## 4. Fluxo fim a fim (desejado)

```
CONSUMIDOR ── POST /api/user-subscriptions ──► create()
  └ valida plano/distribuidora/gateway/quantidade/datas
  └ TX: UserSubscription(PENDING_PAYMENT) + DeliveryDates(PENDING) + Payment(CREATED via gateway)
  └ resposta 201 + redirectUrl ; agenda expiração de assinatura (timeout)        [NOVO A4]

CONSUMIDOR paga no Mercado Pago
  └ webhook ─► SUBSCRIPTION_PAYMENT_HANDLER
       └ Payment CAPTURED ; UserSubscription PENDING_PAYMENT → ACTIVE
       └ enfileira job "gerar entregas elegíveis hoje" desta assinatura          [NOVO M7]

GERAÇÃO DE PEDIDO  (por evento acima OU pelo cron de catch-up)
  para cada DeliveryDate elegível (delivery_date ≤ hoje, status PENDING,
                                   sub ACTIVE, order_id null) — com lock:
    └ TX ÚNICA E IDEMPOTENTE:                                                     [C1 + A2]
        ├ Order criado já CONFIRMED (pré-pago, total 0, data = delivery_date)     [A3]
        ├ items + auditoria ORDER_CREATED/ORDER_CONFIRMED
        ├ DeliveryDate: status=ORDER_CREATED, order_id=Order.id (guard order_id null)
        └ remaining_quantity -= qty (guard) ; se ≤0 → COMPLETED
    └ pós-commit: sendToDistributor(Order) → SENT_TO_DISTRIBUTOR + socket

DISTRIBUIDOR  (fila lê SENT_TO_DISTRIBUTOR…)
  └ aceita → picking → out_for_delivery → DELIVERED   (fluxo de pedido normal)

CONCLUSÃO DO PEDIDO  (compensação — Fase 2)                                       [A5 + M6]
  ├ Order DELIVERED  → DeliveryDate → DELIVERED
  ├ Order REJECTED / DELIVERY_FAILED / CANCELLED
  │      → DeliveryDate volta a PENDING (re-elegível) ; remaining_quantity += qty
  └ todas as transições auditadas

OPERAÇÃO (Fase 3)
  └ lê assinaturas + delivery_dates + status dos pedidos
  └ ações: reprocessar entrega travada, cancelar c/ estorno, pausar/retomar (actor=OPS)
```

---

## 5. Decisões técnicas (definitivas)

### D1 — Pedido de assinatura nasce `CONFIRMED` e é enviado ao distribuidor
O job de geração **não** depende do ramo "cash" do `createOrder`. A geração produz um pedido
pré-pago já confirmado e chama `sendToDistributor` no pós-commit. Resolve o defeito em que o
pedido ficava preso em `CREATED` (invisível ao distribuidor).

### D2 — Geração atômica + idempotente
Criação do `Order`, marcação da `DeliveryDate` (`order_id`) e `decrement` do saldo ocorrem na
**mesma transação**. Idempotência ancorada na `@unique`/guard `order_id IS NULL`: se a entrega já
tem pedido, a geração é no-op. Reexecução do job (crash/retry) nunca duplica.

### D3 — Concorrência segura
A seleção de entregas pendentes usa lock pessimista (`FOR UPDATE SKIP LOCKED`) para permitir
múltiplos workers sem corrida. (Hoje há proteção apenas por `concurrency=1` + scheduler single-instance.)

### D4 — Geração por evento, cron como fallback
A ativação (webhook) enfileira a geração das entregas já vencidas/de hoje. O BullMQ Job Scheduler
(`subscriptionGeneration`, `0 3,8,19 * * *`) permanece como catch-up. Mesma fila `internalJobs`,
mesmo handler idempotente — sem cron novo.

### D5 — Data do pedido = data agendada; entregas vencidas são reagendadas
O pedido usa `DeliveryDate.delivery_date`, não "hoje". **Decisão de negócio:** o sistema deve ser
projetado para que entregas vencidas **não aconteçam** — a geração por evento (D4) na ativação mais
o cron de catch-up garantem geração no dia correto. Como salvaguarda defensiva, se ainda assim uma
entrega estiver com `delivery_date` no passado no momento da geração, ela é **reagendada para a
próxima data válida** da agenda da distribuidora (slot/zona/lead-time válidos), nunca gerada com
data no passado. O reagendamento é auditado.

### D6 — Expiração de assinatura `PENDING_PAYMENT` (fila dedicada)
Worker simétrico ao `expire-payment.processor` de pedidos: assinatura não paga dentro do prazo
(`PAYMENT_EXPIRATION_MINUTES`) vai a `CANCELLED` e seu `Payment` a `EXPIRED`. Idempotente e
serializado por transação (no-op se já `ACTIVE`). **Decisão:** roda em **fila BullMQ dedicada
`subscription-expiration`** (não reaproveita a fila de pagamentos), com `Worker` próprio registrado
em `worker/index.ts`, para isolar concorrência e métricas.

### D7 — Compensação dirigida pelo ciclo do pedido (sem event bus)
Não há barramento de eventos no projeto; integração entre módulos é por chamada direta de serviço.
A compensação é acionada **dentro** dos serviços de ciclo do pedido (`deliver`, `reject`,
`delivery-failed`, `cancel`) chamando um novo `subscriptionSettlementService`. Toda entrega
gerada por assinatura é detectável via `SubscriptionDeliveryDate.order_id`.

### D8 — Estado intermediário `ORDER_CREATED`
`DeliveryDate.status` passa por `ORDER_CREATED` na geração e só vai a `DELIVERED` quando o pedido
é efetivamente entregue. Migration de enum necessária (Fase 2).

### D9 — Cancelamento de assinatura descontinuado (decisão de negócio)
**O cancelamento de assinatura pelo consumidor é removido do produto.** Não há, portanto, estorno
de saldo a calcular. Consequências:
- A rota/serviço de cancelamento (`PATCH /:id/cancel`, `userSubscriptionsService.cancel`) é
  descontinuada e a entrada correspondente no frontend removida.
- O único caminho para `UserSubscriptionStatus.CANCELLED` passa a ser a expiração de pagamento (D6).
- `pause`/`resume` permanecem disponíveis (não são cancelamento).
> Se no futuro o negócio reintroduzir cancelamento, a regra de estorno deverá ser definida aqui antes.

### D13 — Falha persistente após 3 tentativas
Na compensação (D7), uma entrega rejeitada/falha volta a `PENDING` e é re-gerada. Para evitar laço
infinito, cada geração/compensação incrementa `generation_attempts`. **Decisão:** após **3
tentativas**, a entrega vai para `DeliveryDate.status = FAILED` (não re-elegível) e o sistema
**notifica a Operação e o consumidor** (push). O saldo da entrada que falhou permanece creditado
(não consumido) até resolução manual pela Operação (Fase 3).

### D11 — Expiração (`PENDING_PAYMENT`) × `resumePayment` reconciliados
A expiração de assinatura (D6) e o `resumePayment` competem pelo mesmo estado `PENDING_PAYMENT`.
Regra definitiva: ao chamar `resumePayment`, a janela de expiração é **re-armada** (novo job de
expiração agendado a partir do momento da retomada). O job de expiração é idempotente e só atua se
a assinatura **ainda** estiver `PENDING_PAYMENT` no instante da execução; se um pagamento foi
capturado nesse meio-tempo (→ `ACTIVE`), é no-op. Assim o consumidor que retoma o pagamento dentro
da nova janela nunca tem a assinatura cancelada por baixo dele.

### D12 — Envio ao distribuidor pós-commit com recuperação de órfãos
`sendToDistributor` ocorre **após** o commit da transação de geração (precisa emitir socket fora da
transação). Isso cria uma janela: se o processo cair entre o commit e o envio, o `Order` fica em
`CONFIRMED` com a entrega já marcada/debitada, porém invisível ao distribuidor. Mitigação: o caminho
de geração é **reentrante** — ao reprocessar uma `DeliveryDate` cujo `order_id` já existe e cujo
`Order` está em `CONFIRMED`, o sistema **não** cria novo pedido; apenas reexecuta `sendToDistributor`
(idempotente: no-op se já `SENT_TO_DISTRIBUTOR`+). Assim o cron de catch-up recupera pedidos órfãos.

### D10 — Operação read + intervenção
Endpoints `requireRole("ops")` para listar/inspecionar assinaturas e executar ações corretivas,
sempre auditadas com `ActorType.OPS` / `SourceApp.OPS_CONSOLE` (já existentes no schema).

---

## 6. Componentes e responsabilidades (estado final)

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| Criação/ciclo consumidor | `modules/user-subscriptions/services/user-subscriptions.service.ts` | create, resumePayment, pause, resume, cancel (c/ estorno), editDeliveryDate |
| Geração de pedido | `jobs/subscription-job.ts` + (novo) serviço de geração no módulo orders ou user-subscriptions | gera Order pré-pago atômico/idempotente |
| Ativação | `worker/processors/payment-webhook/payment-webhook.handlers.ts` | PENDING_PAYMENT→ACTIVE + enfileira geração |
| Expiração de assinatura (NOVO) | `worker/processors/expire-subscription.processor.ts` (a criar) | PENDING_PAYMENT→CANCELLED por timeout |
| Compensação (NOVO) | `modules/.../subscription-settlement.service.ts` (a criar) | reflete resultado do Order na assinatura |
| Saldo baixo | `jobs/subscription-expiry-job.ts` | push quando remaining ≤ 3 |
| Agendador | `worker/register-repeatable-jobs.ts` | BullMQ Job Schedulers (geração/expiry/otp) |
| Distribuidor | `modules/orders/services/order-query.service.ts` | fila por status do pedido (inalterado) |
| Operação (NOVO) | `modules/ops/*` | leitura + ações sobre assinaturas |

---

## 7. Invariantes (devem ser sempre verdadeiras)

- I1: `SubscriptionDeliveryDate.order_id` preenchido ⇔ existe exatamente um `Order` para a entrega.
- I2: `remaining_quantity` = `total_quantity` − (nº de entregas com pedido ativo/entregue), nunca negativo.
- I3: Uma entrega nunca gera dois pedidos (garantido por D2/I1).
- I4: Todo pedido de origem assinatura visível ao distribuidor está em `SENT_TO_DISTRIBUTOR`+ (nunca `CREATED`).
- I5: Assinatura só permanece em `PENDING_PAYMENT` enquanto dentro da janela de expiração.
- I6: Resultado terminal do pedido sempre reflete no `DeliveryDate` (I1 + D7).
  > **Vale a partir da Fase 2.** Na Fase 1 a compensação ainda não existe: a entrega é marcada de
  > forma interina como `DELIVERED` na geração e um pedido rejeitado/falho **não** recredita o saldo.
  > I6 só passa a ser garantida após a Fase 2 (introdução de `ORDER_CREATED` + settlement).
- I7: Toda `DeliveryDate` com `order_id` preenchido e `Order` em `CONFIRMED` é reenviável ao
  distribuidor sem criar novo pedido (idempotência de envio — D12).

---

## 8. Fora de escopo (explicitamente)

- Renovação automática de assinatura (não existe hoje; não será introduzida nesta rodada).
- Cobrança recorrente real (assinatura segue sendo pré-pago único por janela do plano).
- Alteração do fluxo de pedido do distribuidor além da chegada do pedido pré-pago.
