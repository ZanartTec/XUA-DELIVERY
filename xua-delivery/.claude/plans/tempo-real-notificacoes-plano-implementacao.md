# Plano de Implementação — Tempo real e notificações

> Plano técnico para fazer a informação de pedidos chegar sozinha a todas as telas
> (distribuidora, cliente, motorista, ops) e avisar o distribuidor de pedido novo,
> com a tela aberta ou fechada.
>
> Marcação: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.
> Branch sugerida: `feature/tempo-real-notificacoes` a partir da `develop`.
> Um commit por fase. Nenhuma fase quebra o comportamento atual: os nomes de
> evento não mudam e os payloads só ganham campos.

---

## 0. Escopo: essencial × opcional (revisado em 16/11/2026)

**Todas as tarefas das Fases 0–6 continuam no plano e serão feitas.** A coluna
abaixo só define a **ordem**: as essenciais primeiro; as opcionais (melhorias
aprovadas pelo dono do produto em 16/11) em seguida, cada uma só entra se os testes
da seção 4 continuarem verdes. Itens "aguardando decisão" não são feitos até o dono
do produto escolher.

| Item | Classificação | Motivo |
|---|---|---|
| T1.1, T1.2, T1.4, T1.5, T1.6: adapter + emitter Redis | Essencial | Corrige F1. O emitter do worker só funciona se a API tiver o adapter, então o suporte a várias instâncias vem junto, sem custo extra |
| T1.3: `io.use` + blacklist | Essencial | Correção de segurança pequena (F10) |
| T1.3: desconectar no `exp` do JWT e log de `clientsCount` | Opcional | Melhoria, não corrige falha percebida |
| T1.7: `REALTIME_REDIS_URL` | **Adiado** (decisão de 16/11) | Não muda nada hoje; o tempo real usa o `REDIS_URL` atual. Fazer só se um dia separar o Redis |
| Fase 0: contrato de eventos em `shared` (T0.1, T0.2) | Essencial | Nomes e tipos dos payloads |
| T0.3: constante da matriz no código | Opcional | A matriz já fica neste documento e no teste U5 |
| T2.1 (F11), T2.3 (cancelamento → distribuidora/motorista) | Essencial | Bugs reais |
| T2.6 (gancho de push do novo pedido e do cancelamento para a distribuidora), T2.7 (resumo D6) | Essencial | Pedido explícito |
| T2.2, T2.4 (socket ao cliente na confirmação e no checklist) | Opcional | A confirmação já tem polling; ganho pequeno |
| T2.5 (`delivery_assigned` ao motorista) | Opcional | Não é falha hoje |
| Fase 3: provider, registro desacoplado, resync, reconexão infinita, polling de reserva | Essencial | Corrige F2, F3, F4 |
| T3.3: mapa central de invalidação + coalescência | Essencial | É o que permite tirar a invalidação manual das telas; a coalescência evita rajadas de requisições com as assinaturas (D6) |
| T3.6: indicador "Ao vivo" | Opcional | Conforto |
| T3.7: ouvintes do cliente, do motorista no detalhe e da distribuidora no detalhe | Essencial | Telas que hoje ficam paradas |
| T3.7: toast global de ops | Opcional | Fora dos 4 itens pedidos |
| Fase 4: toast, som, título, dedupe | Essencial | Pedido explícito |
| T4.4 (badge na navegação), T4.5 (toast de cancelamento) | Opcional | Conforto |
| T5.1, T5.2, T5.6, T5.7 (distribuidora), T5.8 | Essencial | Push para a distribuidora + corrige F6, F7, F8 |
| T5.3, T5.4: fila BullMQ `notifications` | **Essencial** (decisão de 16/11) | Retry e deduplicação do push; reaproveita a infraestrutura BullMQ e o worker que já existem |
| T5.7 (pedido de permissão para cliente e motorista) | Opcional | Os pushes do cliente já existem; ativar a inscrição é barato, mas não foi pedido |
| T5.9: suprimir push com aba visível | **Adiado** (decisão de 16/11) | Risco: o Chrome pode mostrar uma notificação genérica no lugar. Nesta entrega o push é sempre mostrado (pode duplicar com o toast) |
| 4.6 teste de carga | **Essencial** (decisão de 16/11) | Prova que o tempo real aguenta o volume esperado antes de ir para produção |

---

## 1. Diagnóstico (estado em 16/11/2026)

### 1.1 Como funciona hoje

```
Serviço de pedido (API)  ──commit──►  orderEventsPublisher  ──►  getIO().to(sala).emit()
                                                                    │
                                              Socket.IO em memória do processo da API
                                                                    │
                          navegador: useSocket() → on("new_order") → invalida React Query
```

- **Salas** (`apps/api/src/infra/socket/gateway.ts`): `${role}:${userId}`,
  `distributor:${distributorId}` (só `distributor_admin`) e `ops:broadcast` (ops/support).
- **Fila BullMQ** (`apps/api/src/worker/`): webhook do Mercado Pago, expiração de
  pagamento, estorno, geração de pedidos de assinatura. Roda em **outro processo**.
- **Web Push** (`notification.service.ts`): envia para `ConsumerPushToken`.
  `Consumer` é a tabela única de usuários (todos os papéis), então o token já serve
  para distribuidor, motorista e ops; a rota `/api/notifications/subscribe` já
  aceita todos os papéis.

### 1.2 Falhas confirmadas no código

| # | Falha | Onde | Efeito |
|---|---|---|---|
| F1 | Worker não tem Socket.IO: `getIO()` devolve um objeto que descarta o envio | `gateway.ts:92` | Pedido **PIX/cartão** (`payment-webhook.handlers.ts:192`) e **assinatura** (`subscription-generation.service.ts:217,235`) chegam ao banco sem `new_order`; `expire-payment.processor.ts:165` também se perde |
| F2 | Ouvintes registrados antes do socket existir são perdidos | `use-socket.ts:42` + `providers.tsx:21` | Após F5/link direto, a fila não recebe nenhum evento |
| F3 | Sem resincronização e reconexão limitada a 10 tentativas | `use-socket.ts:26` | Eventos perdidos durante queda nunca aparecem |
| F4 | Sem polling de reserva na fila do distribuidor | `queue/page.tsx:388` | Nenhuma rede de segurança |
| F5 | Nenhum alerta (som, título, badge, toast global) | — | Pedido só é percebido olhando a tela |
| F6 | `usePushSubscription` não é usado em nenhuma tela | `hooks/consumer/use-push-subscription.ts` | Ninguém se inscreve: os pushes de dispatch/entrega nunca chegam |
| F7 | Payload do push sem `url`/`tag` | `notification.service.ts:60` | Clique sempre abre `/`; notificações do mesmo pedido não se agrupam |
| F8 | Token de push não é removido no logout nem reatribuído por endpoint | `notification.service.ts:25` | Aparelho compartilhado recebe push do usuário anterior |
| F9 | Socket só funciona com 1 instância da API (sem adapter) | `gateway.ts:19` | Escalar a API quebra o tempo real |
| F10 | Autenticação no `connection` assíncrono, sem `io.use` e sem checar blacklist | `gateway.ts:27` | Janela em que o socket está conectado sem sala; token revogado continua recebendo eventos |
| F11 | `sendToDistributor` emite `new_order` também no caminho idempotente (no-op) | `create-order.service.ts:467` | Reprocessamento de webhook gera `new_order` duplicado |
| F12 | `otp_generated` emitido no controller com `getIO()` direto | `orders.controller.ts:349,371` | Fora do publicador, sem tratamento de erro padronizado |

### 1.3 Matriz de status × comunicação

Legenda: ✅ existe · ❌ falta (será criado) · ⚠️ existe mas não chega · — não se aplica.
"Push" = Web Push (app fechado). Processo = onde a transição roda.

| Transição | Processo | Cliente (socket) | Distribuidora (socket) | Motorista (socket) | Ops (socket) | Push proposto |
|---|---|---|---|---|---|---|
| `CREATED → PAYMENT_PENDING` | API | — | — | — | — | — |
| `PAYMENT_PENDING → CONFIRMED` (webhook) | **worker** | ❌ `order_status_changed` | — | — | — | — |
| `CONFIRMED → SENT_TO_DISTRIBUTOR` pagamento na entrega | API | ❌ `order_status_changed` | ✅ `new_order` | — | — | **Distribuidora**: "Novo pedido" |
| `CONFIRMED → SENT_TO_DISTRIBUTOR` PIX/cartão | **worker** | ❌ | ⚠️ `new_order` (F1) | — | — | **Distribuidora**: "Novo pedido" |
| `CONFIRMED → SENT_TO_DISTRIBUTOR` assinatura | **worker** | ❌ | ⚠️ `new_order` (F1) | — | — | Sem push individual (ver D6) |
| `SENT → ACCEPTED_BY_DISTRIBUTOR` | API | ✅ | ✅ | — | — | **Cliente**: "Pedido aceito" ❌ |
| `SENT → REJECTED_BY_DISTRIBUTOR` | API | ✅ | ✅ | — | — | **Cliente**: "Pedido recusado" ❌ |
| atribuir motorista (sem mudar status) | API | — | ✅ | ❌ `delivery_assigned` | — | — |
| `ACCEPTED → READY_FOR_DISPATCH` | API | ❌ | ✅ | — | — | — |
| `READY/REDELIVERY → OUT_FOR_DELIVERY` | API | ✅ + `otp_generated` | ✅ | ✅ `new_delivery` | — | **Cliente**: "Saiu para entrega" ✅ · **Motorista**: "Nova entrega" ❌ |
| `OUT_FOR_DELIVERY → DELIVERED` | API | ✅ | ✅ | — | — | **Cliente**: "Entregue" ✅ |
| `OUT_FOR_DELIVERY → DELIVERY_FAILED` | API | ✅ | ✅ | — | ✅ | **Cliente**: "Não conseguimos entregar" ❌ |
| `DELIVERY_FAILED → REDELIVERY_SCHEDULED` | API | ✅ | ✅ | — | ✅ | **Cliente**: "Reentrega agendada" ❌ |
| `* → CANCELLED` (cliente/ops/distribuidora) | API | ✅ | ❌ | ❌ se havia motorista | — | **Distribuidora**: "Pedido cancelado" se já tinha chegado a ela ❌ · **Motorista** se `OUT_FOR_DELIVERY` ❌ |
| `PAYMENT_PENDING → CANCELLED` (expirou) | **worker** | ⚠️ (F1) | — | — | — | — |
| vasilhame registrado | API | ✅ `bottle_step_recorded` | ✅ | — | — | — |
| OTP bloqueado | API | — | — | — | ✅ `otp_locked` | — |

### 1.4 Matriz de ouvintes (frontend)

| Tela | Escuta hoje | Deve escutar |
|---|---|---|
| `distributor/queue` | `new_order`, `order_status_changed` (com F2) | mesmos, via provider global |
| `distributor/orders/[id]` | nada | `order_status_changed`, `bottle_step_recorded` do pedido |
| `distributor/orders/[id]/checklist` | `order_status_changed` (com F2) | mesmo, via provider (cancelamento durante separação) |
| Shell da distribuidora (todas as telas) | nada | `new_order` → alerta global (Fase 4) |
| `orders` (lista do cliente) | nada | `order_status_changed` |
| `orders/[id]` (cliente) | só `otp_generated` | `order_status_changed`, `otp_generated`, `bottle_step_recorded` |
| `checkout/confirmation` | polling próprio (`setInterval`) | `order_status_changed` + manter polling |
| `driver/deliveries` | `new_delivery`, `order_status_changed` + polling 60s | + `delivery_assigned` |
| `driver/deliveries/[id]` | nada | `order_status_changed` (cancelamento em rota) |
| Console ops/suporte | nada (`otp_locked` e `DELIVERY_FAILED` são emitidos sem ouvinte) | toast global + invalidar `support-order`, `otp-override` |

---

## 2. Arquitetura alvo

```
                    ┌───────────── Redis (pub/sub, canal xua:<env>:socket.io) ─────────────┐
                    │                                                                      │
 API instância A ── io + redis-adapter ◄────────────────────────────────► API instância B ─┤
     │  realtimePublisher.publish()                                                        │
     │                                                                                     │
 Worker ── realtimePublisher.publish() → @socket.io/redis-emitter ─────────────────────────┘
     │
     └── notifications queue (BullMQ) ──► processor ──► web-push ──► navegador (SW) mesmo com app fechado

 Navegador
   RealtimeProvider (1 socket por aba, vive com o login)
     ├── registro de ouvintes independente do socket (corrige F2)
     ├── resync ao reconectar / voltar à aba / voltar a ficar online (F3)
     ├── mapa evento → queryKeys a invalidar, com coalescência
     └── DistributorAlerts: toast + som + título + badge (Fase 4)
```

### Decisões

- **D1 — Redis como barramento, Postgres como verdade.** O evento de socket é só um
  "algo mudou"; a tela sempre relê da API. Perder um evento atrasa, não corrompe.
  Segue o princípio 2 de `docs/doc_desenvolvimento/redis-bullmq/plano-escalabilidade.md`.
- **D2 — `@socket.io/redis-adapter` (pub/sub clássico) + `@socket.io/redis-emitter`.**
  Funciona com o Redis do Render e com `ioredis`, já usado no projeto. O adapter
  "sharded" exige Redis 7 com `SPUBLISH` e não traz ganho nessa escala.
  O adapter de *streams* daria recuperação de estado da conexão, mas o resync
  explícito (D4) resolve o mesmo problema com menos peças.
- **D3 — Um publicador único (`realtimePublisher`)** para API e worker. A escolha
  entre `io` e emitter acontece na inicialização do processo, não em cada chamada.
  Sem inicialização, o publicador **registra erro** em vez de descartar em silêncio.
- **D4 — Garantia "pelo menos uma vez" do lado da tela.** O socket é rápido mas pode
  perder eventos. A tela busca tudo de novo ao reconectar, ao voltar ao foco e com
  polling de reserva (rápido quando desconectado, lento quando conectado).
- **D5 — Push sai do caminho da requisição.** O envio vai para uma fila BullMQ
  `notifications`, com retry e `jobId` de deduplicação. Hoje `.send()` roda inline
  no request e faz I/O externo; isso viola o princípio 6 do plano de escalabilidade.
- **D6 — Pedido de assinatura não dispara push individual.** A geração roda às 00h,
  05h e 16h e pode criar dezenas de pedidos de uma vez. Esses pedidos chegam por
  socket (lista e badge) e o push vira um **resumo por distribuidora ao fim da
  execução** ("8 pedidos de assinatura gerados para amanhã"), sem som.
  **Aprovada em 16/11/2026.**
- **D7 — Contrato de eventos em `packages/shared`.** Nomes e payloads tipados, usados
  pela API e pela web, para que um não quebre o outro.
- **D8 — Nenhuma mudança de nome de evento.** Os payloads só ganham campos. O deploy
  da API pode vir antes do deploy da web sem quebrar nada.

---

## 3. Fases

Ordem: 0 → 1 → 2 → 3 → 4 → 5 → 6. As fases 1 e 3 corrigem o que o distribuidor
sente hoje. Agentes sugeridos entre parênteses.

### FASE 0 — Contrato de eventos (xua-arquiteto)

**Por quê:** hoje os nomes de evento são strings soltas em 15 arquivos, e o payload
de cada emissão é montado na mão.

- [x] **T0.1** `packages/shared/src/realtime/events.ts`
  - `RealtimeEvent` (const): `NEW_ORDER`, `ORDER_STATUS_CHANGED`, `NEW_DELIVERY`,
    `DELIVERY_ASSIGNED`, `OTP_GENERATED`, `OTP_LOCKED`, `BOTTLE_STEP_RECORDED`.
  - Tipos de payload por evento (`RealtimePayloads`). `new_order` passa a levar:
    `orderId`, `status`, `origin` (`"avulso" | "assinatura"`), `deliveryDate`,
    `totalCents`, `itemsCount`, `customerFirstName`. Assim o toast não precisa
    consultar a API.
- [x] **T0.2** `apps/api/src/infra/realtime/rooms.ts`: `rooms.consumer(id)`,
  `rooms.driver(id)`, `rooms.distributor(id)`, `rooms.ops()`. O gateway e o
  publicador passam a usar só estas funções.
- [x] **T0.3** Exportar a matriz 1.3 como constante documental em
  `apps/api/src/modules/orders/realtime/order-realtime-matrix.ts`. Os testes da
  Fase 2 usam essa constante como tabela de casos.

**Validação:** `npm run typecheck` na raiz; nenhuma mudança de comportamento.

### FASE 1 — Transporte entre processos via Redis (xua-devops + xua-backend) → corrige F1, F9, F10, F12

- [x] **T1.1** Instalar `@socket.io/redis-adapter` e `@socket.io/redis-emitter` em
  `apps/api`. As versões devem ser compatíveis com `socket.io@4.8`.
- [x] **T1.2** `apps/api/src/infra/realtime/redis.ts`
  - URL: `getRedisUrl()` de `infra/redis/config.ts` (o `REDIS_URL` atual).
    `REALTIME_REDIS_URL` própria foi adiada (ver seção 0).
  - Chave do canal: `${REDIS_KEY_PREFIX}:socket.io`. Separa dev, staging e prod no
    mesmo Redis e precisa ser **idêntica** no adapter e no emitter.
  - Conexões dedicadas: o adapter usa `pub` + `sub` (o `sub` fica em modo subscriber
    e não pode ser compartilhado); o emitter usa 1 conexão. Não reutilizar o cliente
    de cache nem as conexões do BullMQ.
- [x] **T1.3** `gateway.ts`
  - `io.adapter(createAdapter(pub, sub, { key }))` quando
    `REALTIME_REDIS_ADAPTER !== "off"`. A flag permite desligar sem deploy de código.
  - Autenticação vai para `io.use(async (socket, next) => …)`: token, `verifyToken`,
    checagem de blacklist (`infra/auth/blacklist.ts`) e `socket.join` de todas as
    salas **antes** de `connection`. Erro vira `next(new Error("UNAUTHORIZED"))`.
  - Desconectar quando o JWT expirar: `setTimeout` até `exp`, limpo no `disconnect`.
  - Log com `io.engine.clientsCount` a cada 5 min (nível info) para observabilidade.
- [x] **T1.4** `apps/api/src/infra/realtime/publisher.ts`
  - `initRealtimeServer(io)` (API) e `initRealtimeEmitter()` (worker).
  - `realtimePublisher.publish<E>(room, event: E, payload: RealtimePayloads[E])`:
    nunca lança erro; registra `warn` em falha e `error` se não foi inicializado.
  - `closeRealtime()` no graceful shutdown dos dois processos.
- [x] **T1.5** `orderEventsPublisher` passa a usar `realtimePublisher`.
  **Remover o objeto falso de `getIO()`.** Os chamadores diretos são migrados:
  - `expire-payment.processor.ts:164` → `orderEventsPublisher.notifyConsumer`.
  - `orders.controller.ts:349,371` (`otp_generated`) → mover para dentro de
    `dispatchOrderService.dispatch*`, depois do `cacheCode`, via publicador.
- [x] **T1.6** `worker/bootstrap.ts`: chamar `initRealtimeEmitter()` no início e
  `closeRealtime()` no shutdown.
- [x] **T1.7** `render.yaml`: o worker já tem `REDIS_URL`. Documentar
  `REALTIME_REDIS_ADAPTER` (opcional, padrão ligado) nos dois serviços.
  *(`REALTIME_REDIS_URL` adiada.)*
  Conferir o limite de conexões do plano Redis: são +3 conexões por instância da API
  e +1 por worker.

**Como funciona depois:** o webhook do PIX roda no worker → `sendToDistributor` →
`realtimePublisher` → emitter publica no Redis → o adapter de cada instância da API
recebe e entrega à sala `distributor:<id>` → a fila do distribuidor recarrega.

**Validação:** testes U1–U4 e I1 (seção 4); smoke manual M1 e M2.

> **Resultado (16/11/2026):** T0.1, T0.2 e T1.1–T1.6 concluídas. T1.7 concluída (comentário no `render.yaml`). Testes: 717 unitários verdes (18 testes
> antigos ajustados para o novo publicador; 19 novos) + I1 com Redis real
> (4/4). Manual: pedido "dinheiro na entrega" pela tela do cliente chegou como
> `new_order` na sala da distribuidora; evento publicado por processo separado
> (redis-emitter, como o worker) chegou pela API real. A tela da fila ainda não
> atualiza sozinha: isso depende da Fase 3 (F2).

### FASE 2 — Cobertura de eventos no backend (xua-pedidos) → fecha os ❌ da matriz 1.3

- [x] **T2.1** `sendToDistributor` devolve `{ order, transitioned }` e só emite quando
  `transitioned === true` (corrige F11). Ajustar os 3 chamadores.
  Payload enriquecido conforme T0.1, buscando os dados no mesmo `findById`
  (com `include` dos itens e do nome do cliente).
- [x] **T2.2** `confirmOrder` e `sendToDistributor` → `notifyConsumer` com
  `order_status_changed`. Com isso, a tela de confirmação do PIX vira na hora; o
  polling existente continua como reserva.
- [x] **T2.3** `cancelOrder`: além do cliente, emitir para a distribuidora quando o
  status anterior ∈ {`SENT_TO_DISTRIBUTOR`, `ACCEPTED`, `READY_FOR_DISPATCH`,
  `OUT_FOR_DELIVERY`, `DELIVERY_FAILED`, `REDELIVERY_SCHEDULED`} e para o motorista
  quando `driver_id` existir. Requer ler `current.status` e `current.driver_id`
  antes do update, como já é feito.
- [x] **T2.4** `completeChecklist` → `notifyConsumer` (`READY_FOR_DISPATCH`).
- [x] **T2.5** `assignDriver` → `notifyDriver(driverId, "delivery_assigned")` e, se
  havia motorista anterior, `order_status_changed` para ele.
- [x] **T2.6** Ganchos de push (só enfileiram; o envio é da Fase 5): aceite, recusa,
  falha, reentrega, cancelamento → cliente; novo pedido avulso e cancelamento →
  distribuidora; despacho → motorista. Usar um único helper
  `orderNotifications.onTransition(order, from, to, ctx)` chamado pós-commit, para
  não espalhar regras de push pelos serviços.
- [x] **T2.7** Assinaturas: ao fim de `subscription-generation`, agrupar por
  distribuidora e enfileirar 1 push-resumo (D6).

**Validação:** teste-tabela U5 percorre a matriz 1.3 inteira.

> **Resultado (16/11/2026):** T0.3 e T2.1–T2.7 concluídas. Os ganchos de push
> (T2.6/T2.7) calculam as notificações em `orders/notifications/order-notifications.ts`
> e as entregam ao `pushDispatcher`, que **por enquanto só registra em log**: a fila
> `notifications` e o envio real são da Fase 5 (T5.3–T5.5). Os pushes inline que já
> existiam (despacho e entrega ao cliente) continuam como estavam até a T5.5.
> Testes: 795 unitários verdes (U5 com 63 casos sobre 15 linhas da matriz, U5b,
> resumo D6, regras de texto). Teste de mutação confirmou que U5 acusa divergência.
> Manual com a API real: aceite → cliente e distribuidora recebem; cancelamento pelo
> cliente após aceite chega à distribuidora com `cancelledBy` e `previousStatus`;
> `new_order` enriquecido (nome, itens, total, data); `sendToDistributor` num processo
> separado sobre pedido já tratado devolve `transitioned=false` e não emite.

### FASE 3 — Cliente de tempo real no frontend (xua-frontend) → corrige F2, F3, F4

- [x] **T3.1** `apps/web/src/realtime/realtime-provider.tsx` (montado em
  `app/(app)/providers.tsx`, dentro do `QueryClientProvider`)
  - Cria **um** socket quando `user` existe; desconecta no logout ou na troca de usuário.
  - `reconnection: true`, `reconnectionAttempts: Infinity`, `reconnectionDelay: 1000`,
    `reconnectionDelayMax: 15000`, `randomizationFactor: 0.5` (evita que todos
    reconectem juntos depois de um deploy).
  - **Registro de ouvintes desacoplado:** um `Map<evento, Set<handler>>` no provider.
    O socket recebe **um** ouvinte por evento conhecido (`socket.onAny` filtrado pelo
    contrato), que repassa ao `Set`. Registrar antes ou depois de conectar dá no
    mesmo, o que corrige F2.
  - Estado exposto: `status: "connecting" | "live" | "reconnecting" | "offline"`.
- [x] **T3.2** `useRealtimeEvent(event, handler)`: guarda o handler em ref, então não
  re-registra a cada render. Substitui `useSocket` nas 4 telas atuais; o
  `use-socket.ts` antigo é removido.
- [x] **T3.3** `apps/web/src/realtime/invalidation-map.ts` (função pura)
  - `keysFor(event, payload) → QueryKey[]`. Exemplos:
    `new_order` → `["distributor-queue"]`, `["kpis"]`;
    `order_status_changed` → `["distributor-queue"]`,
    `["distributor-order-detail", orderId]`, `["order", orderId]`, `["orders"]`,
    `["driver-deliveries"]`, `["support-order", orderId]`.
  - O provider aplica o mapa automaticamente para todo evento. As telas não precisam
    mais invalidar à mão; só fazem efeitos de UI (toast, OTP).
  - **Coalescência:** as chaves se acumulam num `Set` e são invalidadas juntas após
    300 ms, para que uma rajada de assinaturas não gere dezenas de requisições.
- [x] **T3.4** Resync: ao `connect` depois de uma desconexão, no `visibilitychange`
  para visível e no evento `online`, invalidar todas as chaves "ao vivo" (lista
  fixa: `distributor-queue`, `driver-deliveries`, `orders`, `order`,
  `distributor-order-detail`).
- [x] **T3.5** Polling de reserva na fila do distribuidor e na lista do motorista:
  `refetchInterval: status === "live" ? 120_000 : 20_000`.
- [x] **T3.6** Indicador discreto no `RoleAppShell` (distribuidora, motorista, ops):
  ponto verde "Ao vivo" ou âmbar "Reconectando…", com `aria-live="polite"`.
- [x] **T3.7** Adicionar os ouvintes que faltam (matriz 1.4): cliente (lista,
  detalhe, confirmação), motorista (detalhe), distribuidora (detalhe do pedido),
  ops (toast global para `otp_locked` e `DELIVERY_FAILED`).

**Validação:** U9–U11, E1–E3, M3–M6.

> **Resultado (16/11/2026):** T3.1–T3.7 concluídas; `use-socket.ts` removido.
> Testes: 811 unitários verdes (U9–U11 novos). `tests/tsconfig.json` ganhou o
> alias `@/src` e `lib: ES2021` (o teste web existente já não compilava sem eles).
> Manual no navegador interno: fila aberta por link direto (caso F2) mostrou
> "Ao vivo" e o pedido novo apareceu sem recarregar; depois de F5 + reinício da
> API, "Reconectando…" → "Ao vivo" em 6,7 s e o cancelamento seguinte sumiu da
> fila sozinho; um evento gera 1 requisição da fila; tela do pedido do cliente
> mudou para "Aceito" e depois "Cancelado" sem recarregar; console sem erros.
> E2E Playwright (E1–E3) e M5 (título da aba) ficam para as Fases 4 e 6.

### FASE 4 — Alerta de pedido novo na distribuidora (xua-frontend) → corrige F5

- [x] **T4.1** `DistributorAlerts`, montado no layout `(distributor)`, ativo em
  **qualquer** tela da distribuidora:
  - Toast persistente de 10 s: "Novo pedido · João · 2 itens · R$ 38,00" com ação
    "Ver" → `/distributor/queue?order=<id>` (abre o painel lateral já existente).
  - **Deduplicação** por `orderId` (um `Set` com teto de 200), para que o resync e o
    push não repitam o alerta.
  - Pedidos `origin = assinatura` não tocam som; só incrementam o badge (D6).
- [x] **T4.2** Som gerado por Web Audio API (dois tons curtos, ~400 ms), sem arquivo
  de áudio e sem questão de licença. O navegador bloqueia som antes de uma interação,
  então o `AudioContext` é desbloqueado no primeiro clique. Botão "Som de novos
  pedidos: ligado/desligado" no cabeçalho da fila, salvo em `localStorage`
  (com try/catch). Vibração `navigator.vibrate([200,100,200])` no celular.
- [x] **T4.3** Título da aba: `(3) Fila · Xuá` enquanto a aba está oculta e há
  pedidos não vistos; zera ao voltar o foco.
- [x] **T4.4** Badge numérico no item "Fila" da navegação com o total de
  `SENT_TO_DISTRIBUTOR` (vem do `summary` que a API da fila já devolve).
- [x] **T4.5** Toast de cancelamento ("Pedido #… foi cancelado pelo cliente") quando
  `order_status_changed` chega com `CANCELLED` para um pedido que estava aceito ou
  em separação.

**Validação:** U12–U13, M7–M9.

> **Resultado (16/11/2026):** T4.1–T4.5 concluídas. Diferença do plano: o "Ver"
> do toast abre `/distributor/orders/<id>` (a fila não tem `?order=` e o painel
> lateral só existe no desktop; a página do pedido funciona em qualquer largura).
> Testes: 822 unitários verdes (U12 novo; U13 é da Fase 5). Manual: na tela de
> Estoque o toast "Novo pedido · João · 2 itens · R$ 50,00" apareceu, o som tocou
> (2 osciladores), o badge "Pedidos" foi de 2 para 3 e "Ver" abriu o pedido;
> cancelamento pelo cliente de pedido aceito mostrou o toast de cancelamento;
> som desligado persistiu após F5 e não tocou; com a aba oculta (simulada via
> `visibilityState`, o pane não oculta abas) o título virou "(2) Xuá Delivery" e
> voltou ao focar. M8 (rajada de 20 assinaturas) não foi feito na tela: coberto
> por U10 (coalescência) e U12 (assinatura sem som/toast).

### FASE 5 — Web Push (xua-backend + xua-banco-dados + xua-frontend) → corrige F6, F7, F8

**Backend**
- [x] **T5.1** Migration (xua-banco-dados) em `ConsumerPushToken`:
  - remover duplicatas por `endpoint` (manter a mais recente);
  - `@@unique([endpoint])`, `@@index([consumer_id])`;
  - colunas `user_agent String?` e `last_success_at DateTime?`.
- [x] **T5.2** `subscribe` vira upsert **por endpoint**, reatribuindo o
  `consumer_id`. Se outra pessoa logar no mesmo navegador, o push passa a ser dela
  (corrige F8). Nova rota `DELETE /api/notifications/subscribe { endpoint }`, que só
  apaga tokens do próprio usuário.
- [x] **T5.3** Fila `notifications` em `infra/queue/contracts.ts` e
  `notifications.producer.ts`. Payload:
  `{ target: { kind: "user" | "distributor", id }, title, body, url, tag, urgency, ttlSeconds, dedupeKey }`.
  `jobId = dedupeKey` (ex.: `new_order:<orderId>`), `attempts: 3`, backoff
  exponencial, `removeOnComplete`.
- [x] **T5.4** Processor no worker: resolve os destinatários (`kind: "distributor"` →
  usuários `DISTRIBUTOR_ADMIN` ativos daquela distribuidora) e chama
  `webPush.sendNotification(sub, payload, { TTL, urgency })`.
  - 404/410 → apaga o token (já existe); sucesso → `last_success_at`.
  - Payload JSON com `title`, `body`, `url`, `tag` (`order-<id>`, agrupa por pedido)
    e `kind`.
  - Sem VAPID configurado → o job conclui com `warn` (feature desligada, sem retry
    infinito).
- [x] **T5.5** Trocar as 3 chamadas inline de `notificationService.send` (dispatch e
  entrega) e as de assinatura pelo producer. `notificationService.send` passa a ser
  usado só pelo processor.

**Frontend**
- [x] **T5.6** Mover `usePushSubscription` para `src/hooks/use-push-subscription.ts`
  (genérico): converter a chave VAPID de base64url para `Uint8Array`, expor
  `unsubscribe()` e estado `unsupported | denied | default | subscribed`.
- [x] **T5.7** Pedidos de permissão em momentos com contexto, nunca no carregamento:
  - Distribuidora: banner na fila ("Ative as notificações para não perder pedidos com
    o app fechado") + card em `distributor/account`.
  - Cliente: na tela de confirmação do pedido ("Quer ser avisado quando sair para
    entrega?") + card no perfil.
  - Motorista: card em `driver/account`.
  - iOS: Web Push só funciona com o PWA instalado na tela inicial (iOS 16.4+).
    Mostrar instrução específica quando `unsupported` em iOS.
- [x] **T5.8** Logout: `DELETE` do endpoint atual + `subscription.unsubscribe()` antes
  de limpar a sessão.
- [x] **T5.9** `public/sw.js`:
  - `requireInteraction: true` e `renotify: true` para `kind = new_order`;
  - **(Adiado em 16/11)** se existir aba **visível e focada** do app, mandar
    `postMessage` para ela em vez de mostrar notificação. Nesta entrega o push é
    sempre mostrado. Retomar só depois de validar no Chrome e no Android que isso
    não aciona a notificação genérica forçada.

**Validação:** U6–U8, I2, M10–M12.

> **Resultado (17/11/2026):** T5.1–T5.9 concluídas (T5.9 só a parte não adiada).
> Migration `20261116230000_push_token_unique_endpoint` aplicada em `xua_delivery`
> (0 duplicatas em 1 token) e `xua_test`. Testes: 841 unitários verdes (U6, U7,
> U8, U13 novos) + I2 2/2 no `xua_test`. `vitest.config.ts` ganhou um setup que
> substitui o producer da fila: teste unitário nunca grava job real no Redis.
> Manual: o navegador interno bloqueia notificações (`permission = denied`) e não
> registra service worker, então M10–M12 (notificação na tela) **não foram
> testados**; o cartão mostrou "Bloqueadas no navegador". O caminho do servidor
> foi provado com um serviço de push falso em HTTPS: pedido real → fila
> `notifications` → worker → web-push entregou payload criptografado (aes128gcm,
> VAPID, TTL 3600, urgency high); endpoint com 410 teve o token apagado;
> `last_success_at` gravado; DELETE de outro usuário não apagou o token, o do dono
> apagou. Retry: falha de rede sem entrega relançou e esgotou as 3 tentativas.

### FASE 6 — Verificação final, documentação e observabilidade (xua-qualidade + xua-docs)

- [x] **T6.1** Rodar toda a seção 4 e registrar os resultados neste arquivo.
- [x] **T6.2** Atualizar `docs/doc_contexto/02-tech-stack.md`, `03-domain-data.md`
  (tabela de eventos; remover `sla_warning` e `order_dispatched`, que não existem
  no código) e `04-active-state.md` (item 8: "Socket.io monolítico" resolvido).
- [x] **T6.3** Adicionar `worker` em `.claude/launch.json` para o preview local subir
  os 3 processos.

---

## 4. Plano de testes

Os testes ficam em `tests/` (centralizados, ver `tests/README.md`). Unitários em
ambiente `node`; a lógica de frontend é extraída para funções puras justamente para
poder ser testada sem jsdom.

### 4.1 Unitários — API (`tests/unit/api/...`)

| ID | Arquivo | O que prova |
|---|---|---|
| U1 | `infra/realtime/publisher.test.ts` | modo servidor chama `io.to(room).emit`; modo emitter chama o emitter; sem inicialização registra `error` e **não** lança; exceção do transporte vira `warn` |
| U2 | `infra/realtime/rooms.test.ts` | nomes de sala estáveis (`distributor:<id>` etc.) |
| U3 | `infra/realtime/gateway.test.ts` | servidor real em porta 0 + `socket.io-client`: sem token → recusa; token na blacklist → recusa; `distributor_admin` entra em `distributor:<id>`; ops entra em `ops:broadcast`; evento emitido para outra distribuidora **não** chega (isolamento entre empresas) |
| U4 | `worker/processors/expire-payment.processor.test.ts` | expiração publica `order_status_changed` via publicador |
| U5 | `modules/orders/realtime/order-realtime-matrix.test.ts` | **teste-tabela:** para cada linha da matriz 1.3, executa o serviço com repositórios mockados e confere salas, eventos e campos do payload; e que nenhum evento é emitido quando a transação falha (rollback) |
| U5b | `create-order.service.test.ts` (estender) | `sendToDistributor` no caminho idempotente **não** emite (F11) |
| U6 | `modules/notifications/notification.service.test.ts` | upsert por endpoint reatribui o usuário; `DELETE` só remove token do próprio usuário; 410 apaga o token; payload tem `url` e `tag` |
| U7 | `worker/processors/notifications.processor.test.ts` | `kind: distributor` resolve só admins **ativos** daquela distribuidora; sem VAPID conclui sem retry; erro 5xx relança (retry) |
| U8 | `infra/queue/notifications.producer.test.ts` | `jobId = dedupeKey`; dois enfileiramentos do mesmo pedido geram 1 job |

### 4.2 Unitários — Web (`tests/unit/web/...`)

| ID | Arquivo | O que prova |
|---|---|---|
| U9 | `realtime/invalidation-map.test.ts` | cada evento do contrato devolve as chaves esperadas; evento desconhecido → `[]` |
| U10 | `realtime/coalescer.test.ts` (fake timers) | 50 eventos em 100 ms → 1 lote; chaves deduplicadas |
| U11 | `realtime/listener-registry.test.ts` | handler registrado **antes** do socket existir recebe eventos depois (regressão de F2); `off` remove; handler com erro não derruba os outros |
| U12 | `distributor/new-order-alerts.test.ts` | dedupe por `orderId`; assinatura não toca som; contador do título sobe com a aba oculta e zera no foco |
| U13 | `lib/vapid.test.ts` | conversão base64url → `Uint8Array` |

### 4.3 Integração (`tests/integration/...`, precisa de Redis)

| ID | O que prova |
|---|---|
| I1 | `infra/realtime/redis-fanout.integration.test.ts`: 2 servidores Socket.IO com adapter + 1 emitter no mesmo Redis. Cliente conectado em B recebe o que foi emitido em A **e** pelo emitter (simula o worker), em < 500 ms. Prefixos diferentes não se misturam (dev × prod) |
| I2 | `notifications.flow.integration.test.ts`: producer → processor com `web-push` mockado → token com 410 é apagado no banco |

### 4.4 E2E Playwright (`tests/e2e/realtime.spec.ts`)

Dois `browserContext` (cookies isolados): distribuidora e cliente.

| ID | Cenário | Esperado |
|---|---|---|
| E1 | Distribuidora na fila; cliente faz pedido com pagamento na entrega | linha aparece em ≤ 5 s sem recarregar; toast "Novo pedido" |
| E2 | **F5 na fila** e depois novo pedido | continua aparecendo (regressão de F2) |
| E3 | `context.setOffline(true)` → pedido criado → `setOffline(false)` | pedido aparece após reconectar (resync) |
| E4 | Pedido PIX confirmado por script que roda `sendToDistributor` num **processo separado** (simula o worker) | aparece na fila (regressão de F1) |
| E5 | Cliente cancela pedido aceito | some da coluna e aparece o toast de cancelamento na distribuidora |
| E6 | Distribuidora despacha | tela do cliente muda para "Saiu para entrega" e mostra o OTP sem recarregar |

### 4.5 Verificação manual no navegador (eu, no browser pane)

Preparação: subir `api`, `web` e `worker` (T6.3). O mesmo navegador compartilha o
cookie `xua-token`, então a distribuidora fica no pane e as ações do cliente e do
motorista são disparadas por chamadas HTTP autenticadas com os usuários de teste.

| ID | Passo | Evidência |
|---|---|---|
| M1 | Pedido "pagamento na entrega" | screenshot da fila com o pedido + toast |
| M2 | Simular webhook PIX aprovado (rota de webhook com payload de teste do MP) | pedido aparece; log do worker mostra o publish |
| M3 | F5 na fila → novo pedido | aparece |
| M4 | Derrubar e subir a API | indicador "Reconectando…" → "Ao vivo" e lista resincronizada |
| M5 | Aba oculta + 2 pedidos | título `(2) Fila · Xuá`; zera ao voltar |
| M6 | Trocar de tela (Estoque) + novo pedido | toast global aparece fora da fila |
| M7 | Som desligado | sem som; preferência mantida após F5 |
| M8 | Rajada de 20 pedidos de assinatura (job manual) | 1 lote de requisições (aba Network), nenhum som, badge = 20 |
| M9 | Console sem erros em todas as telas acima | `read_console_messages` vazio de erros |
| M10 | Build de produção local (`next build && next start`; o SW só registra em produção) + ativar notificações | permissão concedida, token gravado no banco |
| M11 | Fechar a aba e criar pedido | notificação do sistema; clique abre o pedido |
| M12 | Logout | token removido; novo pedido não gera push nesse navegador |

### 4.6 Teste de carga (essencial, antes de produção)

Script `tests/load/realtime-load.ts` (fora do CI): 50 distribuidoras × 3 abas +
400 clientes conectados (≈ 550 sockets), 300 pedidos em 5 min, 2 instâncias da API
com adapter. Metas: p95 de entrega do evento < 1 s, 0 eventos entregues a
distribuidora errada, CPU da API < 50%.

---

### 4.7 Resultados da verificação final (17/11/2026)

| Bloco | Resultado |
|---|---|
| Unitários (U1–U13) | 841/841 verdes; typecheck de API, web e testes limpo |
| Integração (I1, I2 + existentes) | 18/18 no `xua_test` (Redis local para I1) |
| E2E (E1–E6) | 6/6 no Chrome instalado (`E2E_BROWSER_CHANNEL=chrome`), contra o stack de dev. E4 cria o pedido PIX pelo serviço interno num processo separado: a distribuidora do seed não aceita PIX no checkout de dev |
| Manual M1–M9 | feitos nas Fases 1–4 (registro em cada fase); M8 coberto por U10/U12 |
| Manual M10–M12 | **não testados na tela**: o navegador interno bloqueia notificações e service worker. Caminho do servidor provado com serviço de push falso (Fase 5) |
| Carga (4.6), cenário do plano | 550/550 sockets em 2 instâncias; 300 pedidos em 303 s; 1200/1200 entregas, 0 em sala errada; latência p50 3 ms · p95 4 ms · p99 6 ms · máx 8 ms; CPU 0,8% e 0,7% de um núcleo; RSS ~109 MB por instância → **aprovado** |
| Carga, rajada (50 pedidos/s) | 1000 pedidos em 23 s; 4000/4000, 0 em sala errada; p95 5 ms · máx 11 ms; CPU ~9% por instância → **aprovado** |

Ressalva da carga: tudo na mesma máquina e no Redis local (sem latência de
rede). Em produção a latência real soma a ida e volta até o Redis do Render;
a margem para a meta de 1 s continua grande.

## 5. Implantação e reversão

1. **API (Fases 0–2):** com `REALTIME_REDIS_ADAPTER=on`. Com uma única instância, o
   comportamento é idêntico ao atual mais a recepção do worker. Reversão:
   `REALTIME_REDIS_ADAPTER=off` (o worker volta a não emitir, como hoje).
2. **Worker:** no mesmo deploy (mesmo código). Verificar o log
   `Realtime emitter initialized`.
3. **Web (Fases 3–4):** independente; eventos e payloads são retrocompatíveis.
4. **Migration da Fase 5** antes do deploy do código da Fase 5. A deduplicação de
   endpoints é a única operação destrutiva; rodar antes um `SELECT` contando
   duplicatas e registrar o número no PR.
5. **Monitorar por 48 h:** `clientsCount`, erros `Realtime publish failed`, jobs
   `notifications` falhos e tokens removidos por 410.

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Redis fora do ar | O adapter continua entregando localmente; o emitter registra `warn`; polling de reserva (T3.5) e resync cobrem a lacuna |
| Evento duplicado (retry de webhook, resync + push) | Front deduplica por `orderId`; push deduplica por `jobId`; a tela sempre relê da API |
| Rajada de assinaturas | Coalescência de 300 ms + push-resumo (D6) |
| Navegador bloqueia som | Desbloqueio no primeiro clique + toast visual sempre |
| Celular suspende a aba em segundo plano | É exatamente o caso do Web Push (Fase 5) |
| iOS sem push fora do PWA | Instrução de instalação (T5.7) |
| Vazamento entre distribuidoras | Salas derivadas do JWT verificado no servidor; teste U3 de isolamento |
| Token revogado continua no socket | Blacklist no `io.use` + desconexão no `exp` (T1.3) |

## 7. Fora de escopo

Rastreamento GPS do motorista, WhatsApp/SMS, apps nativos, alerta de SLA
(`sla_warning`, citado na documentação mas inexistente no código) e o push de
estorno concluído. Ficam como próximos passos.
