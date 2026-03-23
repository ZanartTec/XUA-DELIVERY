# Xuá Delivery — Data Model

> Baseado no PostgreSQL 16 + Prisma 7.x. Schema real extraído de `prisma/schema.prisma`.

---

## 1. Diagrama de Entidades (ER Resumido)

```
┌─────────────────────┐     1:N     ┌──────────────────────┐
│  Consumer (01_mst)  │────────────▶│  Address (02_mst)    │
│  ─ name, email      │             │  ─ zone_id (FK)      │
│  ─ role, phone      │             │  ─ street, zip_code  │
│  ─ password_hash    │             │  ─ is_default        │
└────────┬────────────┘             └──────────────────────┘
         │ 1:N                                │
         ▼                                    │
┌─────────────────────┐                       │
│  Order (09_trn)     │◀──────────────────────┘
│  ─ status (13 enum) │     1:N     ┌──────────────────────┐
│  ─ delivery_date    │────────────▶│  OrderItem (10_trn)  │
│  ─ delivery_window  │             │  ─ product_id (FK)   │
│  ─ total_cents      │             │  ─ quantity, price   │
│  ─ driver_id (FK)   │             └──────────────────────┘
│  ─ distributor_id   │
│  ─ zone_id (FK)     │     1:1     ┌──────────────────────┐
│  ─ nps_score        │────────────▶│  Payment (13_trn)    │
└──┬──────┬───────────┘             │  ─ kind, status      │
   │      │                         │  ─ amount_cents      │
   │      │  1:N                    │  ─ external_id       │
   │      │         ┌───────────────┴──────────────────────┘
   │      ▼         │
   │  ┌─────────────┴────┐   1:0..1  ┌────────────────────┐
   │  │ AuditEvent(18_aud)│◀─────────│  Deposit (15_trn)  │
   │  │ ─ event_type(24)  │          │  ─ status (enum)   │
   │  │ ─ actor_type      │          │  ─ amount_cents    │
   │  │ ─ payload JSONB   │          └────────────────────┘
   │  │ ─ APPEND-ONLY     │
   │  └──────────────────┘   1:N    ┌─────────────────────┐
   │                        ────────▶│  OrderOtp (16_sec)  │
   │                                 │  ─ otp_hash (HMAC) │
   │                                 │  ─ attempts, TTL   │
   ▼                                 └─────────────────────┘
┌─────────────────────┐
│ Subscription(11_trn)│     N:N     ┌──────────────────────────┐
│ ─ qty, window       │────────────▶│ SubscriptionOrder(12_piv)│
│ ─ next_delivery_date│             │ ─ subscription_id        │
│ ─ status (enum)     │             │ ─ order_id               │
└─────────────────────┘             └──────────────────────────┘

┌─────────────────────┐     1:N     ┌──────────────────────┐
│ Distributor (03_mst)│────────────▶│  Zone (04_mst)       │
│ ─ name, cnpj        │             │  ─ name, is_active   │
│ ─ acceptance_sla_s   │             └──────┬───────────────┘
└─────────────────────┘                     │ 1:N
                                            ▼
                               ┌────────────────────────┐
                               │ ZoneCoverage (05_mst)  │
                               │ ─ neighborhood         │
                               │ ─ zip_code             │
                               └────────────────────────┘
                                            │
                               ┌────────────────────────────┐
                               │ DeliveryCapacity (07_cfg)  │
                               │ ─ delivery_date            │
                               │ ─ window (morning/afternoon│
                               │ ─ capacity_total           │
                               │ ─ capacity_reserved        │
                               │ ─ UNIQUE(zone,date,window) │
                               └────────────────────────────┘

┌─────────────────────┐           ┌──────────────────────────────┐
│ Product (06_mst)    │           │ PaymentWebhookEvent (14_cfg) │
│ ─ name, price_cents │           │ ─ UNIQUE(provider, event_ref)│
│ ─ deposit_cents     │           │ ─ idempotência automática    │
│ ─ is_active         │           └──────────────────────────────┘
└─────────────────────┘
                                  ┌────────────────────────┐
┌──────────────────────────┐      │ Reconciliation (17_trn)│
│ ConsumerPushToken(08_sec)│      │ ─ filled_out, empties  │
│ ─ p256dh, auth, endpoint │      │ ─ delta, justification │
│ ─ (NÃO USADO no código) │      └────────────────────────┘
└──────────────────────────┘
```

---

## 2. Tabelas Completas

### 2.1 Master Tables (01–06)

| Tabela | Colunas Principais | Índices | Status |
|---|---|---|---|
| `01_mst_consumers` | id, name, email (UNIQUE), phone, role, password_hash | email unique | ✅ Implementado |
| `02_mst_addresses` | id, consumer_id, zone_id, label, street, number, complement, neighborhood, city, state, zip_code, is_default | consumer_id | ✅ Implementado |
| `03_mst_distributors` | id, name, cnpj (UNIQUE), phone, email, acceptance_sla_seconds, is_active | cnpj unique | ✅ Implementado |
| `04_mst_zones` | id, distributor_id, name, is_active | distributor_id | ✅ Implementado |
| `05_mst_zone_coverage` | id, zone_id, neighborhood, zip_code | zone_id + zip_code unique | ✅ Implementado |
| `06_mst_products` | id, name, description, price_cents, deposit_cents, is_active | — | ✅ Implementado |

### 2.2 Config Tables (07–08)

| Tabela | Colunas Principais | Constraint Crítico | Status |
|---|---|---|---|
| `07_cfg_delivery_capacity` | id, zone_id, delivery_date, window, capacity_total, capacity_reserved | UNIQUE(zone_id, date, window) + CHECK(reserved ≤ total) | ✅ Implementado |
| `08_sec_consumer_push_tokens` | id, consumer_id, endpoint, p256dh, auth | consumer_id FK | ✅ Schema existe, ❌ Código não usa |

### 2.3 Transaction Tables (09–17)

| Tabela | Colunas Principais | Regra de Negócio | Status |
|---|---|---|---|
| `09_trn_orders` | id, consumer_id, address_id, distributor_id, zone_id, status, delivery_date, delivery_window, subtotal*/fee*/deposit*/total*_cents, nps_score, nps_comment, driver_id, collected_empty_qty, returned_empty_qty, bottle_condition | 13 estados, state machine no service | ✅ Implementado |
| `10_trn_order_items` | id, order_id, product_id, product_name, unit_price_cents, quantity, subtotal_cents | Snapshot de preço no momento | ✅ Implementado |
| `11_trn_subscriptions` | id, consumer_id, address_id, distributor_id, zone_id, product_id, quantity, delivery_window, status, next_delivery_date, price_snapshot_cents | Cron 06h gera pedidos | ✅ Implementado |
| `12_piv_subscription_orders` | id, subscription_id, order_id | Pivot N:N | ✅ Implementado |
| `13_trn_payments` | id, order_id, kind, status, amount_cents, provider, external_id, paid_at, refunded_at | 1:1 com order | ✅ Implementado |
| `14_cfg_payment_webhook_events` | id, provider, provider_event_ref, event_type, payload, processed | UNIQUE(provider, event_ref) | ✅ Implementado |
| `15_trn_deposits` | id, order_id, consumer_id, status, amount_cents, refunded_at | Regra A no DepositService | ✅ Implementado |
| `16_sec_order_otps` | id, order_id, otp_hash, status, attempts, expires_at | HMAC-SHA256, max 5, TTL 90min | ✅ Implementado |
| `17_trn_reconciliations` | id, distributor_id, zone_id, reconciliation_date, filled_out_qty, empties_returned_qty, delta, justification | Justificativa obrigatória se delta > 0 | ✅ Implementado |

### 2.4 Audit Table (18)

| Tabela | Colunas | Regra | Status |
|---|---|---|---|
| `18_aud_audit_events` | id, event_type(24 tipos), actor_type, actor_id, order_id, distributor_id, source_app, payload(JSONB), occurred_at | **APPEND-ONLY: NUNCA UPDATE/DELETE** | ✅ Implementado |

---

## 3. Enums (9 tipos)

| Enum | Valores | Uso |
|---|---|---|
| `DeliveryWindow` | `MORNING`, `AFTERNOON` | Janela de entrega |
| `OrderStatus` | `DRAFT`, `CREATED`, `PAYMENT_PENDING`, `CONFIRMED`, `SENT_TO_DISTRIBUTOR`, `ACCEPTED_BY_DISTRIBUTOR`, `REJECTED_BY_DISTRIBUTOR`, `PICKING`, `READY_FOR_DISPATCH`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `REDELIVERY_SCHEDULED`, `CANCELLED` | Estado do pedido (13 usados + DRAFT/PICKING não usados) |
| `OtpStatus` | `active`, `used`, `expired`, `locked` | Ciclo de vida do OTP |
| `SubscriptionStatus` | `active`, `paused`, `cancelled` | Estado da assinatura |
| `PaymentKind` | `order`, `subscription`, `deposit` | Tipo de pagamento |
| `PaymentStatus` | `created`, `authorized`, `captured`, `failed`, `refunded` | Estado do pagamento |
| `DepositStatus` | `held`, `refund_initiated`, `refunded`, `forfeited` | Ciclo de vida da caução |
| `ActorType` | `consumer`, `distributor_user`, `driver`, `support`, `ops`, `system` | Quem executou a ação |
| `SourceApp` | `consumer_web`, `distributor_web`, `driver_web`, `ops_console`, `backend` | Superfície de origem |

---

## 4. Índices Críticos

| Tabela | Índice | Finalidade |
|---|---|---|
| `07_cfg_delivery_capacity` | UNIQUE(zone_id, delivery_date, window) | Anti-overbooking |
| `14_cfg_payment_webhook_events` | UNIQUE(provider, provider_event_ref) | Idempotência webhook |
| `01_mst_consumers` | UNIQUE(email) | Login único |
| `03_mst_distributors` | UNIQUE(cnpj) | Distribuidor único |
| `18_aud_audit_events` | (order_id, occurred_at) | Queries KPI |

---

## 5. Elementos Faltantes no Schema/Migrations

| Item | Documentação | Status |
|---|---|---|
| Trigger `trg_09_trn_orders_status_regression` | Bloqueia transição a partir de DELIVERED/CANCELLED | ❌ Não existe na migration SQL |
| CHECK constraint `reserved ≤ total` | Anti-overbooking em nível de banco | ⚠️ Verificar se Prisma schema define |
| Índices de performance KPI | Index em `audit_events(order_id, event_type, occurred_at)` | ⚠️ Pode estar implícito |
