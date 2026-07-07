# Feature — Alteração de data de entrega da assinatura

> Documento de acompanhamento da evolução. Status: **em implementação**.

## Objetivo

Permitir que o consumidor **altere a data (e a faixa horária)** de uma entrega futura de uma assinatura já contratada, diretamente em `subscription/manage`, reutilizando as validações de disponibilidade existentes. Em paralelo, **remover o botão de cancelamento** da UI do consumidor (mantendo o endpoint de backend).

## Contexto atual

- As datas de entrega ficam em `28_trn_subscription_delivery_dates` (`delivery_date`, `time_slot_id`, `quantity_for_this_delivery`, `status` = `PENDING|DELIVERED|CANCELLED`, `order_id`).
- Criadas em `POST /api/user-subscriptions` (`userSubscriptionsService.create`), com validação inline: zona coberta (`distributorRepository.resolveCoveredZone`), slots ativos (`timeslotRepository.findActiveByDistributor`), `scheduleService.validateDeliveryDate` (agenda + lead_time + bloqueios), disponibilidade da janela (`scheduleService.getAvailableDates`) e período do plano (`valid_from..valid_until`).
- O cron diário (`subscription-job.ts`) casa `delivery_date = hoje` + `status=PENDING` + `order_id=null` + assinatura `ACTIVE`, gera `Order`, marca a data como `DELIVERED` e decrementa `remaining_quantity`.
- `subscription/manage` lista assinaturas e expõe pausar/retomar/**cancelar**. Não há edição de data.

## Decisões tomadas (validadas com o usuário)

1. **Antecedência:** reutilizar **apenas** as validações da criação (`validateDeliveryDate` → lead_time da distribuidora). Sem piso extra de "24h/próximo dia". *(Ver Pendência P1.)*
2. **Cancelamento:** manter o backend (`PATCH /:id/cancel`, controller e service); remover **apenas** o botão/fluxo na UI do consumer.
3. **Escopo da edição:** alterar **data + faixa horária (time slot)**.
4. **Status editável:** assinaturas **ACTIVE** e **PAUSED**; somente entregas futuras com `status=PENDING`.
5. **Persistência:** **update in place** da linha (`delivery_date` + `time_slot_id`) + nova coluna **`updated_at`**. Sem tabela de histórico nem evento de auditoria (consistente com o padrão do módulo, que não audita ciclo de vida de assinatura). *(Ver Pendência P4.)*

## Arquivos impactados

**Backend**
- `packages/shared/src/schemas/user-subscription.ts` — `userSubscriptionDeliveryDateEditSchema`.
- `apps/api/src/modules/user-subscriptions/routes/user-subscriptions.routes.ts` — `PATCH /:id/delivery-dates/:deliveryDateId`.
- `apps/api/src/modules/user-subscriptions/controllers/user-subscriptions.controller.ts` — handler + códigos de erro.
- `apps/api/src/modules/user-subscriptions/services/user-subscriptions.service.ts` — helper de validação compartilhado + `editDeliveryDate`.
- `apps/api/src/modules/user-subscriptions/repository/user-subscriptions.repository.ts` — `findDeliveryDateById`, `updateDeliveryDate`, recomputo de `start/end_date`.
- `prisma/schema.prisma` + migration — `updated_at` em `28_trn_subscription_delivery_dates`.

**Frontend**
- `apps/web/src/components/consumer/edit-delivery-date-sheet.tsx` (novo).
- `apps/web/app/(consumer)/subscription/manage/page.tsx` — remover cancelar; adicionar editar; estender tipos.

**Reuso (não recriar):** `scheduleService.validateDeliveryDate`/`getAvailableDates`, `distributorRepository.resolveCoveredZone`, `timeslotRepository.findActiveByDistributor`, `DeliveryDateCalendar`, `TimeSlotPicker`, `useAvailableDeliveryDates`.

## Alterações planejadas

- **Endpoint:** `PATCH /api/user-subscriptions/:id/delivery-dates/:deliveryDateId` (RBAC consumer + ownership), body `{ date, time_slot_id }`.
- **Service `editDeliveryDate`:** valida ownership + status da assinatura (ACTIVE/PAUSED), valida a delivery date alvo (pertence, `PENDING`, `order_id=null`, data futura), valida a nova data/slot via helper compartilhado, atualiza em transação e recomputa `start/end_date`.
- **Cron:** sem mudança de lógica (transação + checagens evitam corrida).
- **UI:** botão "Editar" por entrega futura editável; Sheet com calendário (1 data) + picker de horário; estados loading/sucesso/erro; remoção do botão cancelar.

## Pendências (decisão de produto — não resolver por suposição)

- **P1.** "1 dia de antecedência" foi relaxado para o lead_time da distribuidora. Aceitável a nova data ter < 24h quando lead_time curto?
- **P2.** A nova data deve permanecer dentro de `plan.valid_from..valid_until`? (Implementação assume **sim**, por reuso.) Pode estender além da validade/`end_date`?
- **P3.** Limite de quantas vezes a mesma entrega pode ser editada? (assumido: sem limite.)
- **P4.** Exigir trilha de auditoria/histórico da alteração? (atual: só `updated_at`.)
- **P5.** A edição pode alterar `quantity_for_this_delivery`? (assumido: **não**.)
- **P6.** Sem cancelamento na UI, como o consumidor abandona uma assinatura `PENDING_PAYMENT`/`ACTIVE`? (ex.: ops cancela? expira?)
- **P7.** Confirmar recomputo de `start_date`/`end_date` ao editar (implementação: recomputa min/max).

## Dúvidas para validação

Ver Pendências P1–P7. Todas devem ser confirmadas com produto antes do go-live.

## Histórico da implementação

- **2026-06-13 — Planejamento aprovado**; documento criado.
- **2026-06-13 — Implementação concluída:**
  - **Banco:** coluna `updated_at` em `28_trn_subscription_delivery_dates` (`schema.prisma` + migration `20260613000000_add_updated_at_to_subscription_delivery_dates`); `prisma generate` ok.
  - **Shared:** `userSubscriptionDeliveryDateEditSchema` (`{ date, time_slot_id }`).
  - **Backend:** helper `assertDeliveryDatesValid` extraído do `create` (reuso sem nova regra); novo `userSubscriptionsService.editDeliveryDate`; repository `updateDeliveryDateSchedule` + `updateDateRange`; controller `editDeliveryDate` + códigos (`DELIVERY_DATE_NOT_FOUND`=404, `NOT_EDITABLE`=409); rota `PATCH /api/user-subscriptions/:id/delivery-dates/:deliveryDateId`.
  - **Frontend:** componente `edit-delivery-date-sheet.tsx` (reusa `DeliveryDateCalendar` + `TimeSlotPicker` + `useAvailableDeliveryDates`); `manage/page.tsx` ganhou botão "Editar" por entrega futura `PENDING` e teve o botão "Cancelar" + ramo `cancel` do `doAction` removidos.
  - **Docs:** `doc_sistema/fluxo-usuarios.md` atualizado (cancelar removido da UI; edição adicionada).
  - **Verificação:** `tsc` (web + api, ignorando erros pré-existentes em `*.test.ts` por ausência de `vitest`) e `eslint` dos arquivos alterados limpos. **Pendente:** suíte de testes não pôde rodar neste ambiente (`vitest` não instalado) — adicionar teste unitário de `editDeliveryDate` quando o ambiente de testes estiver disponível.

- **2026-06-13 — Correção (timezone off-by-one):** a checagem de disponibilidade da janela dimensionava o range de `getAvailableDates` via `daysAheadUntil(new Date(iso))`, misturando meia-noite UTC com `today` local (UTC-3). A maior data "recuava" 1 dia e ficava fora do range → `availabilityByDate.get(date)` retornava `undefined` → falso `DATE_UNAVAILABLE` (422), mesmo com `validateDeliveryDate` passando. Substituído por `daysAheadForIso(maxIso)`, que conta dias por componentes de data (sem hora/UTC). Correção no helper compartilhado → beneficia criação e edição.

### Decisões de implementação registradas
- Persistência **in place** + `updated_at` (sem histórico/auditoria) — Pendência P4 aberta.
- `editDeliveryDate` recomputa `start_date`/`end_date` (min/max) — atende P7.
- Edição só de entrega **futura** `PENDING` sem `order_id`, em assinatura `ACTIVE`/`PAUSED`.
