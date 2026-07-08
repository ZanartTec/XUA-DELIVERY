# 03 — Domain & Data: Schema, Fluxos e Rotas

> **Árvore de Contexto — Galhos.** Fonte da verdade do schema: `prisma/schema.prisma` (36 tabelas, 20 enums). Última consolidação: 07/07/2026.

---

## 1. Modelagem do banco de dados

Convenção: `<numero>_<tipo>_<nome>` · UUID em todas as chaves · dinheiro em centavos `Int` · timestamps UTC.

### 1.1 Cadastro mestre (`mst`)

| Tabela | Campos principais | Descrição / Relacionamentos |
|---|---|---|
| `01_mst_consumers` | `name`, `email` (unique), `phone`, `document`, `password_hash`, `role` (ConsumerRole), `is_b2b`, `distributor_id` FK, `auto_assign_distributor`, `preferred_distributor_id` | Todos os usuários (5 roles). 1:N com addresses, orders, push_tokens, deposits, user_subscriptions, password_reset_tokens; N:1 com distributor quando usuário interno |
| `02_mst_addresses` | `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `zip_code`, `zone_id` FK, `is_default` | Endereços do consumidor (sem lat/lng; lookup por CEP). N:1 consumers/zones; 1:N orders |
| `03_mst_distributors` | `name`, `cnpj` (unique), `phone`, `email`, `acceptance_sla_seconds`, `is_active`, `allows_consumer_choice` | Distribuidoras parceiras. 1:N zones, orders, schedule, blocked_dates, time_slots, reconciliations; 1:1 payment_settings |
| `04_mst_zones` | `distributor_id` FK, `name`, `is_active` | Zonas de atendimento. 1:N zone_coverage, addresses, orders |
| `05_mst_zone_coverage` | `zone_id` FK, `neighborhood`, `zip_code` | Resolve "esse endereço é atendido?" |
| `06_mst_products` | `name`, `price_cents`, `deposit_cents`, `kind` (ProductKind), `bottle_product_id` FK, `is_active` | Catálogo. `WATER` aponta para seu vasilhame (`BOTTLE`) via `bottle_product_id`. N:N com categories; 1:N order_items. Criação/reativação pela ops provisiona automaticamente item de estoque `SELLABLE_PRODUCT` na mesma transação (fix 07/07/2026) |
| `07_mst_categories` | `name`, `sort_order`, `is_active` | Categorias do catálogo (N:N implícito com products) |
| `29_mst_inventory_items` | `code` (unique), `name`, `type` (InventoryItemType), `product_id` FK?, `unit_label`, `low_stock_threshold`, `is_active` (default `true`) | Itens de estoque: produtos vendáveis, retornáveis cheios/vazios, insumos. Origem: seeds + provisionamento automático na criação/reativação de produto (fix 07/07/2026, `code` = slug do nome + fragmento do UUID). `is_active = false` = soft delete do cadastro: saldos ocultos por default nas listagens (fix 07/07/2026), movimentos rejeitados, histórico preservado |

### 1.2 Configuração operacional (`cfg`)

| Tabela | Campos principais | Descrição |
|---|---|---|
| `14_cfg_payment_webhook_events` | `provider`, `provider_event_ref` (UNIQUE composto), `event_type`, `payload`, `signature_valid`, `processed_at`, `retry_count` | Idempotência de webhooks |
| `19_cfg_banners` | `type` (CAROUSEL/FEATURED), `title`, `subtitle`, `cta_*`, `bg_*`, `is_active`, `sort_order` | Banners promocionais do catálogo |
| `20_cfg_idempotency_keys` | `key` (unique), `status` (IdempotencyStatus), `locked_at`, `processed_at` | Dedup de operações críticas |
| `22_cfg_distributor_schedule` | `distributor_id`, `weekday` (0–6), `is_active`, `lead_time_hours` | Agenda semanal (até 7 registros/distribuidora) |
| `23_cfg_distributor_blocked_dates` | `distributor_id`, `blocked_date`, `reason` — `UNIQUE(distributor_id, blocked_date)` | Exceções (feriados, manutenção) |
| `24_cfg_time_slots` | `distributor_id`, `label`, `start_hour/minute`, `end_hour`, `window` (DeliveryWindow), `sort_order` | Faixas horárias dentro das janelas |
| `25_cfg_subscription_plans` | `name`, `product_id` FK, `quantity`, `discount_percentage`, `unit_price_with_discount_cents`, `valid_from/until`, `is_active` | Planos pré-definidos pela ops |
| `34_cfg_distributor_payment_settings` | `distributor_id` (UNIQUE), `accepts_pix_online`, `accepts_credit_online`, `accepts_cash_on_delivery`, `accepts_card_on_delivery`, `provider`, `mp_access_token_enc`, `mp_webhook_secret_enc`, `mp_public_key` | Pagamento por distribuidora; tokens AES-256-GCM |
| `35_cfg_consumer_deposit_programs` | `distributor_id` + `consumer_id` (UNIQUE composto), `consumer_document_snapshot`, `is_enabled`, `max_bottles` (0 = bloqueado, nunca "ilimitado"), `enabled_by/at`, `disabled_by/at` | Habilitação da caução v2 por cliente |

### 1.3 Transacionais (`trn`)

| Tabela | Campos principais | Descrição |
|---|---|---|
| `09_trn_orders` | `consumer_id`, `address_id`, `distributor_id`, `zone_id`, `driver_id`, `status` (OrderStatus, 14 valores), `delivery_date`, `delivery_window`, `time_slot_id` (snapshot), `subtotal_cents`, `deposit_cents`, `total_cents`, `bottles_full_ordered`, `empty_bottles_provided`, `collected_empty_qty`, `rating`, `nps_score`, `accepted_at`, `dispatched_at`, `delivered_at` | **Entidade central.** Índices: fila do distribuidor, NPS por distribuidora, histórico do consumidor |
| `10_trn_order_items` | `order_id`, `product_id`, `product_name`, `unit_price_cents`, `quantity`, `subtotal_cents` | Snapshot imutável dos itens |
| `13_trn_payments` | `order_id` FK?, `user_subscription_id` FK?, `kind` (ORDER/SUBSCRIPTION/DEPOSIT), `status` (PaymentStatus), `amount_cents`, `payment_method`, `cash_change_for_cents`, `provider`, `provider_payment_ref`, `external_id` (unique), `idempotency_key`, `paid_at` | Cobranças; pagamento de assinatura liga-se à assinatura, não ao pedido |
| `15_trn_deposits` | `order_id`, `consumer_id`, `amount_cents`, `status` (DepositStatus), `refunded_at` | **Caução financeira v1 — LEGADO** (substituída pela v2) |
| `17_trn_reconciliations` | `distributor_id`, `reconciliation_date`, `full_out`, `empty_returned`, `delta`, `justification`, `closed_by` | Conciliação diária de vasilhames; justificativa obrigatória se delta > 0 |
| `21_trn_payment_transactions` | `payment_id`, `action`, `provider_status`, `provider_response` JSON, `idempotency_key` | Trilha técnica de interações com o gateway |
| `27_trn_user_subscriptions` | `consumer_id`, `plan_id`, `distributor_id`, `address_id`, `total_quantity`, `remaining_quantity`, `start_date`, `end_date`, `status` (UserSubscriptionStatus), `low_balance_notification_sent_at` | Assinatura contratada; notificação de saldo baixo quando `remaining_quantity ≤ 3` (idempotente) |
| `28_trn_subscription_delivery_dates` | `user_subscription_id`, `delivery_date`, `time_slot_id`, `quantity_for_this_delivery`, `status` (DeliveryDateStatus), `order_id` FK? (unique), `generation_attempts` | Datas de entrega da assinatura; retry máx 3 → `FAILED` |
| `30_trn_distributor_inventory_balances` | `distributor_id` + `inventory_item_id` (UNIQUE), `quantity_on_hand`, `last_movement_at` | Saldo materializado de estoque |
| `31_trn_inventory_movements` | `distributor_id`, `inventory_item_id`, `quantity_delta`, `movement_type` (11 tipos), `actor_type/id`, `source_app`, `reference_type/id`, `occurred_at` | Log imutável de movimentações |
| `32_trn_inventory_reconciliation_sessions` | `distributor_id`, `status` (OPEN/CLOSED), `opened_by`, `closed_by`, `justification` | Sessões de contagem física |
| `33_trn_inventory_reconciliation_items` | `session_id`, `inventory_item_id`, `snapshot_quantity`, `counted_quantity`, `delta`, `adjustment_movement_id` FK | Itens da sessão; ajuste gerado no fechamento |
| `36_trn_consumer_deposit_balances` | `distributor_id` + `consumer_id` + `inventory_item_id` (UNIQUE), `bottles_on_loan` (nunca negativo), `last_movement_at` | Saldo de vasilhames emprestados (caução v2) |

### 1.4 Segurança, auditoria e histórico (`sec` / `aud` / `log` / `piv`)

| Tabela | Campos principais | Descrição |
|---|---|---|
| `08_sec_consumer_push_tokens` | `consumer_id`, token Web Push | Notificações no navegador/PWA |
| `16_sec_order_otps` | `order_id`, `otp_hash` (HMAC-SHA256), `status` (OtpStatus), `attempts`, `expires_at` | POD; texto claro nunca persistido; novo OTP por tentativa de entrega |
| `38_sec_password_reset_tokens` | `consumer_id`, `token_hash` (unique, HMAC-SHA256), `expires_at` (30 min), `used_at` | Reset de senha, uso único |
| `18_aud_audit_events` | `event_type` (AuditEventType, 34 valores), `actor_type` (ActorType), `actor_id`, `order_id?`, `source_app` (SourceApp), `payload` jsonb, `occurred_at` | **APPEND-ONLY** — nunca UPDATE/DELETE. Fonte de verdade para KPIs. Modelo plano (sem `recorded_at`/`geo`/`correlation`) |
| `37_log_consumer_deposit_movements` | `distributor_id`, `consumer_id`, `inventory_item_id`, `bottles_delta`, `movement_type` (DepositMovementType), `actor_type/id`, `source_app`, `order_id?`, `occurred_at` | Event-sourcing da caução v2; saldo é derivado |
| `26_piv_subscription_plan_distributors` | PK composta `(plan_id, distributor_id)` | N:N planos ↔ distribuidoras |

> **Tabela removida:** `07_cfg_delivery_capacity` (migration `20260601000000`). O número `07` foi reutilizado por `07_mst_categories`. Não há reserva numérica de capacidade/anti-overbooking por contagem — disponibilidade = agenda semanal + datas bloqueadas + lead-time.

### 1.5 Enums (20)

| Enum | Valores |
|---|---|
| `OrderStatus` (14) | `DRAFT, CREATED, PAYMENT_PENDING, CONFIRMED, SENT_TO_DISTRIBUTOR, ACCEPTED_BY_DISTRIBUTOR, REJECTED_BY_DISTRIBUTOR, PICKING, READY_FOR_DISPATCH, OUT_FOR_DELIVERY, DELIVERED, DELIVERY_FAILED, REDELIVERY_SCHEDULED, CANCELLED` |
| `DeliveryWindow` | `MORNING, AFTERNOON` |
| `OtpStatus` | `ACTIVE, USED, EXPIRED, LOCKED` |
| `PaymentKind` | `ORDER, SUBSCRIPTION, DEPOSIT` |
| `PaymentStatus` | `CREATED, AUTHORIZED, CAPTURED, FAILED, REFUNDED, EXPIRED` |
| `DepositStatus` | `HELD, REFUND_INITIATED, REFUNDED, FORFEITED, CANCELLED` |
| `ActorType` | `CONSUMER, DISTRIBUTOR_USER, DRIVER, SUPPORT, OPS, SYSTEM` |
| `ConsumerRole` | `CONSUMER, DISTRIBUTOR_ADMIN, DRIVER, SUPPORT, OPS` |
| `SourceApp` | `CONSUMER_WEB, DISTRIBUTOR_WEB, DRIVER_WEB, OPS_CONSOLE, BACKEND` |
| `AuditEventType` (34) | ver §3 |
| `IdempotencyStatus` | `PENDING, PROCESSED, FAILED` |
| `UserSubscriptionStatus` | `PENDING_PAYMENT, ACTIVE, PAUSED, CANCELLED, COMPLETED` |
| `DeliveryDateStatus` | `PENDING, ORDER_CREATED, DELIVERED, FAILED, CANCELLED` |
| `BannerType` | `CAROUSEL, FEATURED` |
| `InventoryItemType` | `SELLABLE_PRODUCT, RETURNABLE_FULL, RETURNABLE_EMPTY, SUPPLY` |
| `ProductKind` | `WATER, BOTTLE, OTHER` |
| `InventoryMovementType` (11) | `INITIAL_LOAD, ORDER_ACCEPT_OUT, ORDER_CANCEL_RETURN, DELIVERY_FAILED_RETURN, EMPTY_RETURN_IN, RECONCILIATION_ADJUSTMENT, MANUAL_CORRECTION, LOSS_WRITE_OFF, PURCHASE_IN, DEPOSIT_LOAN_OUT, DEPOSIT_RETURN_IN` |
| `DepositMovementType` | `LOAN_OUT, RETURN_IN, MANUAL_ADJUSTMENT, WRITE_OFF` |
| `InventoryReferenceType` | `ORDER, RECONCILIATION_SESSION, INITIAL_LOAD, MANUAL_ADJUSTMENT, PURCHASE, SYSTEM` |
| `InventoryReconciliationStatus` | `OPEN, CLOSED` |

---

## 2. Máquina de estados do pedido (regras de negócio core)

### 2.1 Happy path com guardrails

| Transição | Guardrail | Eventos |
|---|---|---|
| `DRAFT → CREATED` | endereço válido e coberto + janela selecionada + `validateDeliveryDate()` (agenda ativa, sem bloqueio, lead-time ok — senão HTTP 422) | `ORDER_CREATED` (payload inclui `distributor_selection_mode: manual\|auto`) |
| `CREATED → PAYMENT_PENDING` | preço final calculado | `ORDER_PRICING_FINALIZED`, `PAYMENT_CREATED` |
| `PAYMENT_PENDING → CONFIRMED` | pagamento capturado via webhook | `PAYMENT_CAPTURED`, `ORDER_CONFIRMED` (+ `DEPOSIT_HELD` na 1ª compra, v1 legado) |
| `CONFIRMED → SENT_TO_DISTRIBUTOR` | distribuidora resolvida (`resolveDistributor()`) | `ORDER_RECEIVED_BY_DISTRIBUTOR` + Socket.io `new_order` na sala `distributor:{id}` |
| `SENT → ACCEPTED_BY_DISTRIBUTOR` | dentro do SLA (`acceptance_sla_seconds`) | `ORDER_ACCEPTED_BY_DISTRIBUTOR` |
| `ACCEPTED → PICKING → READY_FOR_DISPATCH` | checklist 3 itens 100% (itens, vasilhames, endereço/contato) — sem bypass | `DISPATCH_CHECKLIST_COMPLETED` |
| `READY → OUT_FOR_DELIVERY` | motorista atribuído; OTP gerado e enviado | `ORDER_DRIVER_ASSIGNED`, `ORDER_DISPATCHED`, `OTP_GENERATED`, `OTP_SENT` |
| `OUT_FOR_DELIVERY → DELIVERED` | OTP válido **ou** override autorizado; exigir `BOTTLE_EXCHANGE_RECORDED` **ou** `EMPTY_NOT_COLLECTED` com motivo | `OTP_VALIDATION_ATTEMPTED`, `ORDER_DELIVERED` |

> **Invariante estoque × catálogo:** produto ativo ⇒ item de estoque vendável ativo vinculado. O aceite (`resolveOrderInventoryLines`) exige exatamente 1 item ativo vendável por produto (senão falha com `INVENTORY_ITEM_NOT_FOUND`); a invariante é garantida por provisionamento transacional no `POST`/`PATCH` de produtos (fix 07/07/2026) — regra aplicacional, sem constraint de banco.

### 2.2 Caminhos alternativos

- `SENT → REJECTED_BY_DISTRIBUTOR`: motivo obrigatório (lista padronizada); ação: cancelar + reembolsar ou redistribuir.
- `PAYMENT_PENDING → CANCELLED`: timeout/falha de pagamento (`PAYMENT_FAILED`/`PAYMENT_EXPIRED`).
- `OUT_FOR_DELIVERY → DELIVERY_FAILED`: motivo obrigatório → `REDELIVERY_REQUIRED`.
- `DELIVERY_FAILED → REDELIVERY_SCHEDULED → OUT_FOR_DELIVERY → DELIVERED`: `attempt_number` incrementa; **novo OTP por tentativa**.
- **Proteção de banco:** trigger bloqueia qualquer transição a partir de `DELIVERED`/`CANCELLED`.

### 2.3 Resolução de distribuidora (`resolveDistributor()`)

1. Valida se o endereço pertence ao consumidor logado; obtém `zone_id`; verifica zona ativa.
2. Se o payload traz `distributor_id`: valida cobertura da zona + `is_active` + `allows_consumer_choice` → usa (`mode='manual'`).
3. Senão (ou se inválido): usa `zone.distributor_id` (`mode='auto'`).
4. Modo registrado no evento `ORDER_CREATED`.

### 2.4 Fluxo de assinatura (Fases 1 e 2 — implementadas)

1. Ops cria plano → consumidor contrata via wizard 5 etapas (Plano → Distribuidor → Endereço → Datas → Pagamento); validações: plano ativo, distribuidora vinculada ao plano, soma das quantidades = `plan.quantity`, datas dentro da vigência.
2. Assinatura nasce `PENDING_PAYMENT`; webhook de pagamento ativa (`ACTIVE`). Não pagas expiram via job.
3. **Fase 1 — geração atômica:** por evento na ativação + cron de segurança, o worker cria pedido confirmado (valor 0, já pago) por data; data vira `ORDER_CREATED` e o pedido segue o fluxo normal.
4. **Fase 2 — compensação:** rejeição/cancelamento ⇒ recrédito + nova tentativa (`generation_attempts`, máx 3 → `FAILED` + notificação).
5. Todas entregues ⇒ `COMPLETED`. Saldo baixo (`remaining_quantity ≤ 3`) dispara push idempotente.

### 2.5 Caução de vasilhames v2

- Distribuidora habilita cliente no programa (`max_bottles`; `0` = bloqueado).
- Empréstimo/devolução geram movimentos append-only (`LOAN_OUT`, `RETURN_IN`, `MANUAL_ADJUSTMENT`, `WRITE_OFF`); saldo materializado nunca negativo.
- Eventos de auditoria: `DEPOSIT_BOTTLES_LOANED/RETURNED/WRITTEN_OFF`, `DEPOSIT_PROGRAM_ENABLED/DISABLED`.
- **v1 (legado):** caução financeira `15_trn_deposits` — Regra A: `HELD → REFUND_INITIATED` somente quando `DELIVERED AND collected_empty_qty ≥ 1`, validada apenas no backend.

### 2.6 KPIs (calculados só por eventos)

| KPI | Meta | Fórmula |
|---|---|---|
| SLA de aceitação | ≥ 98% | #(Δt ≤ SLA) / #(`ORDER_RECEIVED_BY_DISTRIBUTOR`), onde Δt = t(accepted) − t(received) |
| Taxa de aceitação | ≥ 95% | #(`ORDER_ACCEPTED`) / #(`ORDER_RECEIVED`) |
| Taxa de reentrega | ≤ 3% | #(`REDELIVERY_REQUIRED`) / #(`ORDER_DELIVERED`) |
| NPS por distribuidora | — | `ROUND(AVG(nps_score), 1)` de pedidos `DELIVERED` |

---

## 3. Eventos de auditoria (`AuditEventType` — 34 tipos)

`ORDER_CREATED · ORDER_PRICING_FINALIZED · ORDER_CONFIRMED · ORDER_CANCELLED · ORDER_RECEIVED_BY_DISTRIBUTOR · ORDER_ACCEPTED_BY_DISTRIBUTOR · ORDER_REJECTED_BY_DISTRIBUTOR · ORDER_DRIVER_ASSIGNED · DISPATCH_CHECKLIST_COMPLETED · ORDER_DISPATCHED · OTP_GENERATED · OTP_SENT · OTP_VALIDATION_ATTEMPTED · OTP_OVERRIDE · ORDER_DELIVERED · BOTTLE_EXCHANGE_RECORDED · EMPTY_NOT_COLLECTED · REDELIVERY_REQUIRED · REDELIVERY_SCHEDULED · PAYMENT_CREATED · PAYMENT_CAPTURED · PAYMENT_FAILED · PAYMENT_EXPIRED · PAYMENT_REFUNDED · PAYMENT_REFUND_FAILED · DEPOSIT_HELD · DEPOSIT_REFUND_INITIATED · DEPOSIT_REFUNDED · DAILY_RECONCILIATION_CLOSED · DEPOSIT_BOTTLES_LOANED · DEPOSIT_BOTTLES_RETURNED · DEPOSIT_BOTTLES_WRITTEN_OFF · DEPOSIT_PROGRAM_ENABLED · DEPOSIT_PROGRAM_DISABLED`

---

## 4. Mapa de rotas da API (registro em `apps/api/src/http/routes.ts`)

| Módulo | Rota base | Endpoints principais | Auth |
|---|---|---|---|
| Auth | `/api/auth` | `POST /login`, `POST /register`, `POST /logout`, `POST /forgot-password`, `POST /reset-password`, `GET /check-blacklist` | Públicas (exceto logout) |
| Orders | `/api/orders` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id/accept`, `PATCH /:id/reject`, `PATCH /:id/assign-driver`, `PATCH /:id/dispatch`, `PATCH /:id/verify-otp`, `PATCH /:id/deliver`, `PATCH /:id/cancel`, `POST /:id/rating`, `POST /:id/bottle-exchange`, `POST /:id/empty-not-collected`, `PATCH /:id/reschedule` | JWT + RBAC |
| Payments | `/api/payments` | `POST /charge`, `GET /status/:orderId`, `POST /webhook` (público, assinatura HMAC) | JWT / público |
| Driver | `/api/driver` | `GET /deliveries`, `GET /deliveries/pending`, `GET /deliveries/history` | `driver` |
| Distributor | `/api/distributor` | `GET /kpis`, `GET /drivers`, `GET /inventory/balances` (`?is_active=true\|false`, default `true` — só itens ativos), `PATCH /deposit-program/:consumerId`, `GET/PATCH /payment-settings/:distributorId`, `PUT /schedule/:distributorId/weekdays`, `POST/DELETE /schedule/:distributorId/block-date` | `distributor_admin`/`ops` |
| Distributors (público) | `/api/distributors` | `GET ?zone_id=&date=&window=` — lista para seleção no checkout, ordenada por `avg_nps DESC NULLS LAST` | Público |
| Consumers | `/api/consumers` | `GET/PATCH /profile`, `GET/POST /addresses`, `DELETE /addresses/:id`, `PATCH /:id/assign-mode`, `GET /cep/:cep` | `consumer` |
| Products / Categories / Banners | `/api/products`, `/api/categories`, `/api/banners` | `GET /` (catálogo — `consumer`/`ops`/`distributor_admin`), `GET /all`, `POST /`, `PATCH /:id` (ops; em products, create/update provisiona item de estoque vendável na mesma transação) | JWT + RBAC |
| Zones | `/api/zones` | `GET /:id/available-dates?days=14` (agenda + bloqueios + lead-time) | Público |
| Notifications | `/api/notifications` | `POST /push-subscribe`, `POST /push-notify` | JWT |
| Subscription Plans | `/api/subscription-plans` | `GET /`, `GET /:id` (auth), `POST /`, `PATCH /:id` (ops only) | misto |
| User Subscriptions | `/api/user-subscriptions` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id/pause`, `PATCH /:id/resume`, `PATCH /:id/cancel` (sem caller na UI), `PATCH /:id/delivery-dates/:deliveryDateId` | `consumer` |
| Ops | `/api/ops` | `GET /kpis`, `GET /audit-events`, `GET /reconciliations`, `GET /inventory/balances` (`?is_active`, default `true`), `GET /inventory/balances/:id` | `ops`/`support` (inventário: `ops`) |
| Reconciliations | `/api/reconciliations` | `POST /`, `GET /summary` | `distributor_admin` |
| Jobs internos | `/api/internal/jobs` | `POST /subscription`, `POST /otp-cleanup`, `POST /subscription-expiry` | `INTERNAL_JOB_SECRET` |

**Rate limits:** orders 100/min, pagamentos 10/min, password reset 5/min por IP.

---

## 5. Rotas web (Next.js App Router — 46 páginas)

- **(auth):** `/login`, `/register`, `/forgot-password`, `/reset-password`
- **(consumer):** `/catalog`, `/cart`, `/checkout/schedule`, `/checkout/distributor`, `/checkout/payment`, `/checkout/confirmation`, `/orders`, `/orders/[id]`, `/subscription/create`, `/subscription/manage`, `/profile`, `/profile/addresses`, `/profile/edit`
- **(distributor):** `/distributor/queue`, `/distributor/orders/[id]`, `/distributor/orders/[id]/checklist`, `/distributor/routes/[id]`, `/distributor/reconciliation`, `/distributor/kpis`, `/distributor/schedule`, `/distributor/inventory`, `/distributor/inventory/reconciliation`, `/distributor/payment-config`, `/distributor/deposit-program`
- **(driver):** `/driver/deliveries`, `/driver/deliveries/[id]/otp`, `/driver/deliveries/[id]/exchange`, `/driver/deliveries/[id]/non-collection`, `/driver/deliveries/[id]/failure`, `/driver/history`
- **(ops):** `/ops/kpis`, `/ops/zones`, `/ops/banners`, `/ops/products`, `/ops/subscription-plans`, `/ops/inventory`, `/ops/inventory/reconciliations`, `/ops/otp-override`, `/ops/audit-export`, `/support`, `/support/[id]`

---

## 6. Integrações externas

| Integração | Uso | Detalhes |
|---|---|---|
| **Mercado Pago** | Pagamentos (Pix, cartão; dinheiro na entrega registrado) | Adapter concreto; credenciais **por distribuidora** (AES-256-GCM); webhook com validação HMAC + dedup + fila BullMQ; expiração automática |
| **Resend** | E-mail transacional | Reset de senha (fire-and-forget async) |
| **ViaCEP** | Autocomplete de endereço | Fetch no frontend ao digitar CEP |
| **Web Push API** | Notificações | Estados críticos do pedido, OTP, saldo baixo de assinatura |
| **Socket.io** | Realtime | Salas `${role}:${userId}` e `distributor:${distributorId}`; eventos `new_order`, `order_status_changed`, `order_dispatched`, `sla_warning` |
| **Google Maps** | Link externo | "Abrir no Google Maps" na lista de paradas (sem API integrada) |

---

**Última atualização: 07 de julho de 2026.**
