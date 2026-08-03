# Xuá Delivery — Guia Técnico Completo
## Banco de Dados · Arquitetura · Plano de Desenvolvimento

> **ZANART — Soluções em Desenvolvimento de Software · Confidencial**

| | |
|---|---|
| **Stack** | Monorepo npm workspaces: Express 5 API (`apps/api`) + Next.js 16 Web (`apps/web`) |
| **Banco** | PostgreSQL 16 — 36 tabelas, 19 enums |
| **UI** | shadcn/ui + Tailwind CSS 4 + Radix UI (mobile-first responsivo) |
| **Real-time** | Socket.io 4.x no servidor Express (porta 4000) |
| **Deploy** | Railway (API + Web separados) ou Docker Compose local |
| **Queue** | BullMQ 5.x + Redis (ioredis 5.x) — worker separado |
| **Versão** | 4.1 — Julho 2026 (monorepo Express + Next.js) |

**36** tabelas · **14** estados/pedido · **39** tipos/evento · **5** perfis/RBAC

---

## 1. Visão Geral do Sistema

O Xuá Delivery é uma plataforma de delivery de água mineral em garrafão retornável 20L. Na versão atual, o sistema é um **monorepo npm workspaces** com três pacotes principais:

- `apps/api` — backend Express 5 (porta 4000): toda a API REST, autenticação JWT, Socket.IO, lógica de negócio, integração com MercadoPago e BullMQ
- `apps/web` — frontend Next.js 16 (porta 3001): UI puramente client-side consumindo a API Express
- `packages/shared` — schemas Zod, tipos e enums compartilhados entre api e web

Além dos dois servidores principais, há um **processo worker** separado (`apps/api/src/worker/index.ts`) que processa filas BullMQ para webhooks de pagamento e jobs de assinatura. Jobs recorrentes (assinaturas, expiração de OTP) são disparados por um scheduler externo via HTTP POST em `/api/internal/jobs/*`.

O banco de dados PostgreSQL tem **36 tabelas** e **19 enums**. O schema é gerenciado pelo Prisma 7.x com adaptador `@prisma/adapter-pg`. E-mails transacionais (redefinição de senha, notificações) são enviados via **Resend**.

### Superfícies e Responsabilidades

| Superfície | Perfil JWT | Responsabilidades |
|---|---|---|
| **Área do Consumidor** — Web mobile-first | `consumer` | Realizar pedidos, pagamento integrado, agendar janela de entrega (manhã/tarde), **selecionar distribuidora quando há 2 ou mais opções disponíveis** (com auto-skip se ≤1), acompanhar status em tempo real via Socket.io, gerenciar assinatura mensal, visualizar OTP de entrega, avaliar pedido (NPS 5 estrelas), **configurar preferência de distribuidora automática no perfil** |
| **Área do Distribuidor** — Web responsivo | `distributor_admin` | Receber pedidos com SLA countdown (vermelho <60s), aceitar/recusar com motivo obrigatório, checklist de saída (3 itens, bloqueio até 100%), despachar pedido (gera OTP), lista de paradas, conciliação diária de vasilhames, dashboard de KPIs, gestão de inventário operacional |
| **Módulo Motorista** — Web PWA (offline) | `driver` | Executar rota de entregas, confirmar entrega via OTP 6 dígitos (max 5 tentativas, TTL 90min), registrar troca de vasilhame (qty + condição: ok/danificado/sujo), motivo de não-coleta obrigatório, operar offline com fila IndexedDB + sync automático ao reconectar |
| **Painel de Operações** — Web desktop | `ops` / `support` | Configurar zonas, dashboard KPIs de todos distribuidores (Recharts), console de suporte (busca telefone/email/order_id + timeline de audit_events), reagendar entregas, override de OTP com motivo obrigatório, exportar auditoria CSV, gestão de banners e planos de assinatura |

### Arquitetura — Monorepo com Express + Next.js separados

```
Navegador (Consumidor / Distribuidor / Motorista / Ops)
  React Client Components + TanStack Query + Zustand
              ↓ fetch / Socket.io-client

  ┌────────────────────────┐     ┌─────────────────────────┐
  │   apps/web             │     │   apps/api              │
  │   Next.js 16 (:3001)   │────>│   Express 5 (:4000)     │
  │   proxy.ts (RBAC JWT)  │     │   REST + Socket.IO      │
  │   Tailwind + shadcn/ui │     │   BullMQ Worker         │
  └────────────────────────┘     └────────────┬────────────┘
                                              │ Prisma 7.x
  ┌─────────────────┬──────────────────┬──────────────────────┐
  │  PostgreSQL 16  │    Redis 7       │  MercadoPago         │
  │  36 tabelas     │  JWT blacklist   │  Webhooks            │
  │  19 enums       │  BullMQ queues   │  idempotentes        │
  │  triggers       │  OTP TTL cache   │  Conta por distrib.  │
  └─────────────────┴──────────────────┴──────────────────────┘
```

> O frontend Next.js é um cliente puro da API Express. Não existem Route Handlers de negócio nem Server Actions — toda a lógica está no `apps/api`.

**Jobs recorrentes:** Não há node-cron. Um scheduler externo (Railway Cron ou similar) faz HTTP POST nos endpoints `/api/internal/jobs/subscription`, `/api/internal/jobs/otp-cleanup` e `/api/internal/jobs/subscription-expiry`, protegidos por `INTERNAL_JOB_SECRET`. Cada endpoint pode enfileirar a tarefa no BullMQ ou executá-la de forma síncrona como fallback.

### KPIs Operacionais Monitorados

Calculados exclusivamente via `18_aud_audit_events`. O `KpiService` faz queries diretas nessa tabela — nunca consulta `09_trn_orders` para métricas.

| KPI | Meta | Cálculo (somente via audit_events) |
|---|---|---|
| **SLA de aceitação** | ≥ 98% | Aceites dentro do prazo (`acceptance_sla_seconds`) / total pedidos recebidos pelo distribuidor. Eventos: `ORDER_RECEIVED_BY_DISTRIBUTOR` → `ORDER_ACCEPTED_BY_DISTRIBUTOR`. Diferença de `occurred_at` deve ser menor que SLA configurado. |
| **Taxa de aceitação** | ≥ 95% | Pedidos aceitos (ACCEPTED) / total recebidos (RECEIVED) no período. Rejeições (REJECTED) contam contra a taxa. |
| **Taxa de reentrega** | ≤ 3% | Pedidos com `REDELIVERY_REQUIRED` / total com `ORDER_DELIVERED` no período. Mede eficiência da primeira tentativa de entrega. |

---

## 2. Banco de Dados — PostgreSQL 16

**Convenção de nomenclatura:** `<numero>_<tipo>_<nome_tabela>`

Tipos: `mst` (master), `cfg` (config), `trn` (transacional), `piv` (pivot N:N), `sec` (segurança), `aud` (auditoria append-only), `log` (histórico event-sourcing).

> O schema atual tem **35 tabelas** (numeração `01`–`38`, sem `11`, `12` e `15`). A tabela `07_cfg_delivery_capacity` foi removida (migration `20260601000000_remove_delivery_capacity`) — o número `07` foi reutilizado por `07_mst_categories`. A `15_trn_deposits` (caução financeira v1) foi arquivada em `z_arch_15_trn_deposits` e removida do schema (jul/2026); o número `15` fica aposentado. O controle de disponibilidade agora é feito pela agenda da distribuidora e validação de lead-time. Além das 5 tabelas de inventário (`29`–`33`) e 4 de assinatura v2 (`25`–`28`), foram adicionadas: `34_cfg_distributor_payment_settings` (pagamento por distribuidora), `35`–`37` (caução de vasilhames v2) e `38_sec_password_reset_tokens` (redefinição de senha). O Prisma Client usa o adaptador `@prisma/adapter-pg`. Em 02/08/2026, `01_mst_consumers` ganhou a coluna `is_active` e `audit_event_type` ganhou 5 valores (`DISTRIBUTOR_CREATED`, `DISTRIBUTOR_UPDATED`, `DRIVER_CREATED`, `DRIVER_UPDATED`, `DRIVER_LINKED_TO_DISTRIBUTOR`) para o CRUD de Distribuidor/Motorista — migration `20260802130000_add_consumer_is_active_and_management_audit_events` gerada, **ainda não aplicada em nenhum banco** (ver `doc_desenvolvimento/distribuidor-motorista-crud.md`).

### 2.1 Mapa de Tabelas

| Tabela | Tipo | Responsabilidade |
|---|---|---|
| `01_mst_consumers` | mst | Usuários da plataforma. Roles: `consumer`, `distributor_admin`, `driver`, `ops`, `support`. Campos `auto_assign_distributor`, `preferred_distributor_id` e `is_active` (default `true`, migration `20260802130000` — desativa motorista/admin de distribuidora; checado no login, gerada mas não aplicada ainda) |
| `02_mst_addresses` | mst | Endereços de entrega por consumidor (múltiplos, com `zone_id` para identificar zona) |
| `03_mst_distributors` | mst | Parceiros distribuidores. Campo `allows_consumer_choice` habilita seleção manual no checkout |
| `04_mst_zones` | mst | Regiões de cobertura por distribuidor |
| `05_mst_zone_coverage` | mst | Bairros e CEPs cobertos por cada zona |
| `06_mst_products` | mst | Catálogo de produtos. Campo `kind` (`WATER`/`BOTTLE`/`OTHER`) e vínculo `bottle_product_id` para caução de vasilhame |
| `07_mst_categories` | mst | Categorias do catálogo (N:N com produtos) |
| `08_sec_consumer_push_tokens` | sec | Tokens Web Push API para notificações no navegador |
| `09_trn_orders` | trn | Pedido principal — 14 estados (`OrderStatus`). Snapshot imutável de timeslot. |
| `10_trn_order_items` | trn | Itens de cada pedido (snapshot: `product_name`, `unit_price_cents`, `quantity`) |
| `13_trn_payments` | trn | Cobranças. `kind`: ORDER ou SUBSCRIPTION. `provider`: mercadopago ou mock |
| `14_cfg_payment_webhook_events` | cfg | Idempotência de webhooks: `UNIQUE(provider, provider_event_ref)` |
| ~~`15_trn_deposits`~~ | — | Caução financeira v1 **removida (jul/2026)**: arquivada em `z_arch_15_trn_deposits` e substituída pela caução de vasilhames v2 (`35`–`37`) |
| `16_sec_order_otps` | sec | OTPs: `otp_hash` HMAC-SHA256, TTL em `expires_at`, max 5 tentativas, status `LOCKED` |
| `17_trn_reconciliations` | trn | Conciliação diária: `full_out`, `empty_returned`, `delta`, justificativa obrigatória se delta > 0 |
| `18_aud_audit_events` | aud | **APPEND-ONLY** — fonte de verdade para KPIs. 39 tipos de evento. Nunca UPDATE/DELETE. |
| `19_cfg_banners` | cfg | Banners promocionais configuráveis pela ops. Tipo: `CAROUSEL` ou `FEATURED` |
| `20_cfg_idempotency_keys` | cfg | Chaves de idempotência para deduplicar operações críticas em fluxos assíncronos |
| `21_trn_payment_transactions` | trn | Log técnico de interações com o provedor de pagamento |
| `22_cfg_distributor_schedule` | cfg | Agenda semanal da distribuidora: `weekday` (0-6), `is_active`, `lead_time_hours` |
| `23_cfg_distributor_blocked_dates` | cfg | Datas bloqueadas por distribuidora. `UNIQUE(distributor_id, blocked_date)` |
| `24_cfg_time_slots` | cfg | Faixas horárias dentro da janela. `start_hour`, `end_hour`, `window` (MORNING/AFTERNOON) |
| `25_cfg_subscription_plans` | cfg | Planos de assinatura. Define produto, quantidade, desconto, preço com desconto e período de validade |
| `26_piv_subscription_plan_distributors` | piv | Pivot N:N entre planos e distribuidoras |
| `27_trn_user_subscriptions` | trn | Assinatura contratada. Rastreia `total_quantity`, `remaining_quantity`, `status` |
| `28_trn_subscription_delivery_dates` | trn | Datas de entrega de uma assinatura. Cada data tem qty, time_slot_id, status e order_id gerado |
| `29_mst_inventory_items` | mst | Catálogo de itens de inventário. Tipos: `SELLABLE_PRODUCT`, `RETURNABLE_FULL/EMPTY`, `SUPPLY` |
| `30_trn_distributor_inventory_balances` | trn | Saldo materializado de estoque por distribuidora+item. `UNIQUE(distributor_id, inventory_item_id)` |
| `31_trn_inventory_movements` | trn | Log imutável de movimentações. 11 tipos de movimento (ex: `ORDER_ACCEPT_OUT`, `EMPTY_RETURN_IN`, `DEPOSIT_LOAN_OUT`) |
| `32_trn_inventory_reconciliation_sessions` | trn | Sessões de reconciliação de inventário. Status: `OPEN` ou `CLOSED` |
| `33_trn_inventory_reconciliation_items` | trn | Itens de uma sessão: snapshot, contagem física, delta e movimento de ajuste gerado |
| `34_cfg_distributor_payment_settings` | cfg | Métodos de pagamento aceitos + credenciais Mercado Pago da distribuidora (criptografadas AES-256-GCM). `UNIQUE(distributor_id)` |
| `35_cfg_consumer_deposit_programs` | cfg | Programa de caução de vasilhames v2: habilitação por (distribuidora, consumidor) com `max_bottles` (0 = bloqueado) |
| `36_trn_consumer_deposit_balances` | trn | Saldo materializado de vasilhames emprestados por (distribuidora, consumidor, item). `bottles_on_loan` nunca negativo |
| `37_log_consumer_deposit_movements` | log | Histórico append-only da caução v2 (`LOAN_OUT`, `RETURN_IN`, `MANUAL_ADJUSTMENT`, `WRITE_OFF`). Fonte de verdade do saldo |
| `38_sec_password_reset_tokens` | sec | Tokens de redefinição de senha: `token_hash` HMAC-SHA256 único, TTL 30min, uso único (`used_at`) |

### 2.2 Relacionamentos Principais

| Origem | Cardinalidade | Destino | Regra |
|---|---|---|---|
| `01_mst_consumers` | 1 : N | `02_mst_addresses` | Múltiplos endereços por consumidor |
| `01_mst_consumers` | 1 : N | `09_trn_orders` | Histórico de pedidos do consumidor |
| `03_mst_distributors` | 1 : N | `04_mst_zones` | Distribuidor cobre uma ou mais zonas |
| `09_trn_orders` | 1 : N | `10_trn_order_items` | Pedido tem um ou mais produtos |
| `03_mst_distributors` | 1 : 1 | `34_cfg_distributor_payment_settings` | Configuração de pagamento própria por distribuidora |
| `03_mst_distributors` | 1 : N | `35_cfg_consumer_deposit_programs` | Programa de caução v2 habilitado por consumidor |
| `37_log_consumer_deposit_movements` | N : 1 | `36_trn_consumer_deposit_balances` | Saldo é a soma dos movimentos (derivado, por chave lógica) |
| `01_mst_consumers` | 1 : N | `38_sec_password_reset_tokens` | Tokens de redefinição de senha |
| `09_trn_orders` | 1 : 1 | `13_trn_payments` | Cada pedido gera exatamente uma cobrança |
| `09_trn_orders` | 1 : N | `16_sec_order_otps` | Novo OTP a cada tentativa de entrega |
| `09_trn_orders` | 1 : N | `18_aud_audit_events` | Todo evento gravado com timestamp |
| `03_mst_distributors` | 1 : N | `22_cfg_distributor_schedule` | Agenda semanal (7 registros possíveis por distribuidora) |
| `03_mst_distributors` | 1 : N | `23_cfg_distributor_blocked_dates` | Datas bloqueadas para a distribuidora |
| `25_cfg_subscription_plans` | N : N | `03_mst_distributors` | Via `26_piv_subscription_plan_distributors` |
| `27_trn_user_subscriptions` | N : 1 | `25_cfg_subscription_plans` | Cada assinatura do consumidor referencia um plano |
| `27_trn_user_subscriptions` | 1 : N | `28_trn_subscription_delivery_dates` | Datas de entrega agendadas pelo consumidor no momento da contratação |
| `27_trn_user_subscriptions` | 1 : N | `13_trn_payments` | Pagamento vinculado diretamente à assinatura (não ao pedido) |
| `28_trn_subscription_delivery_dates` | 0..1 : 1 | `09_trn_orders` | Pedido gerado quando a data de entrega é processada |

### 2.3 Enums PostgreSQL

| Enum (Prisma) | Valores |
|---|---|
| `DeliveryWindow` | `MORNING` \| `AFTERNOON` |
| `OrderStatus` | `DRAFT` \| `CREATED` \| `PAYMENT_PENDING` \| `CONFIRMED` \| `SENT_TO_DISTRIBUTOR` \| `ACCEPTED_BY_DISTRIBUTOR` \| `REJECTED_BY_DISTRIBUTOR` \| `PICKING` \| `READY_FOR_DISPATCH` \| `OUT_FOR_DELIVERY` \| `DELIVERED` \| `DELIVERY_FAILED` \| `REDELIVERY_SCHEDULED` \| `CANCELLED` |
| `OtpStatus` | `ACTIVE` \| `USED` \| `EXPIRED` \| `LOCKED` |
| `PaymentKind` | `ORDER` \| `SUBSCRIPTION` (`DEPOSIT` legado da caução v1, mantido no enum Postgres) |
| `PaymentStatus` | `CREATED` \| `AUTHORIZED` \| `CAPTURED` \| `FAILED` \| `REFUNDED` \| `EXPIRED` |
| `ActorType` | `CONSUMER` \| `DISTRIBUTOR_USER` \| `DRIVER` \| `SUPPORT` \| `OPS` \| `SYSTEM` |
| `ConsumerRole` | `CONSUMER` \| `DISTRIBUTOR_ADMIN` \| `DRIVER` \| `SUPPORT` \| `OPS` |
| `SourceApp` | `CONSUMER_WEB` \| `DISTRIBUTOR_WEB` \| `DRIVER_WEB` \| `OPS_CONSOLE` \| `BACKEND` |
| `AuditEventType` | 39 tipos — ver seção 3.5 |
| `IdempotencyStatus` | `PENDING` \| `PROCESSED` \| `FAILED` |
| `UserSubscriptionStatus` | `PENDING_PAYMENT` \| `ACTIVE` \| `PAUSED` \| `CANCELLED` \| `COMPLETED` |
| `DeliveryDateStatus` | `PENDING` \| `ORDER_CREATED` \| `DELIVERED` \| `FAILED` \| `CANCELLED` |
| `BannerType` | `CAROUSEL` \| `FEATURED` |
| `InventoryItemType` | `SELLABLE_PRODUCT` \| `RETURNABLE_FULL` \| `RETURNABLE_EMPTY` \| `SUPPLY` |
| `ProductKind` | `WATER` \| `BOTTLE` \| `OTHER` |
| `InventoryMovementType` | `INITIAL_LOAD` \| `ORDER_ACCEPT_OUT` \| `ORDER_CANCEL_RETURN` \| `DELIVERY_FAILED_RETURN` \| `EMPTY_RETURN_IN` \| `RECONCILIATION_ADJUSTMENT` \| `MANUAL_CORRECTION` \| `LOSS_WRITE_OFF` \| `PURCHASE_IN` \| `DEPOSIT_LOAN_OUT` \| `DEPOSIT_RETURN_IN` |
| `DepositMovementType` | `LOAN_OUT` \| `RETURN_IN` \| `MANUAL_ADJUSTMENT` \| `WRITE_OFF` |
| `InventoryReferenceType` | `ORDER` \| `RECONCILIATION_SESSION` \| `INITIAL_LOAD` \| `MANUAL_ADJUSTMENT` \| `PURCHASE` \| `SYSTEM` |
| `InventoryReconciliationStatus` | `OPEN` \| `CLOSED` |

> 19 enums no total. `ProductKind` e `DepositMovementType` foram adicionados com a caução de vasilhames v2; `DepositStatus` (caução financeira v1) foi removido em jul/2026.

### 2.4 Regras Críticas do Banco

**Controle de disponibilidade:** A tabela `07_cfg_delivery_capacity` foi removida (migration 2026-06-01). A disponibilidade de datas agora é controlada pelo serviço de agenda (`ScheduleService`): verifica se o dia da semana está ativo (`22_cfg_distributor_schedule`), se a data não está bloqueada (`23_cfg_distributor_blocked_dates`) e se o lead-time mínimo é respeitado. Datas/janelas indisponíveis retornam HTTP 422 com códigos `WEEKDAY_INACTIVE`, `DATE_BLOCKED` ou `LEAD_TIME_VIOLATION`.

**Idempotência de webhook:** `14_cfg_payment_webhook_events`: `UNIQUE(provider, provider_event_ref)`. `INSERT ON CONFLICT DO NOTHING` — duplicado ignorado automaticamente.

**Caução de vasilhames (v2):** o programa é habilitado por consumidor e distribuidora em `35_cfg_consumer_deposit_programs` (`max_bottles`; `0` = bloqueado). Cada empréstimo/devolução gera um movimento em `37_log_consumer_deposit_movements` (append-only) e o saldo materializado fica em `36_trn_consumer_deposit_balances` (`bottles_on_loan` nunca negativo). Vasilhames são produtos `kind = BOTTLE` vinculados à água via `bottle_product_id`.

**Caução financeira — Regra A (v1, removida jul/2026):** o modelo antigo retinha dinheiro em `15_trn_deposits` e o devolvia quando `DELIVERED AND collected_empty_qty ≥ 1` (validação no `DepositService`, nunca no frontend). Foi desativado: tabela arquivada em `z_arch_15_trn_deposits`, `DepositService` e o evento `DEPOSIT_HELD/REFUND_*` não existem mais no fluxo. A caução atual é por vasilhames (v2, abaixo).

**Pagamento por distribuidora:** `34_cfg_distributor_payment_settings` define os métodos aceitos e as credenciais Mercado Pago da própria distribuidora. Tokens sensíveis (`mp_access_token_enc`, `mp_webhook_secret_enc`) são criptografados com AES-256-GCM antes de persistir.

**Redefinição de senha:** `38_sec_password_reset_tokens` guarda apenas `token_hash = HMAC-SHA256(token, PASSWORD_RESET_SECRET)`. TTL de 30 minutos e uso único via `used_at`.

**OTP com hash:** `16_sec_order_otps`: `otp_hash = HMAC-SHA256(codigo, OTP_SECRET)`. Texto claro **NUNCA** persistido. Max 5 tentativas, TTL 90min. Após 5 erros → `locked` → só override ops/support.

**Audit append-only:** `18_aud_audit_events`: **NUNCA** recebe UPDATE ou DELETE. Fonte de verdade para KPIs, disputas e auditoria. Todos os Services gravam aqui na mesma transação da mutação de estado.

**Trigger de proteção:** `trg_09_trn_orders_status_regression`: Bloqueia transição a partir de `DELIVERED` e `CANCELLED`. Proteção em nível de banco, independente da aplicação.

---

## 3. Arquitetura do Sistema — Monorepo Express + Next.js

> **Regra de ouro:** nenhuma lógica de negócio no frontend. O `apps/web` é um cliente puro. Toda a lógica de negócio, validação (Zod), autenticação e autorização vivem no `apps/api`.

### 3.1 Camadas do Sistema

#### Backend — `apps/api` (Express 5, porta 4000)

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Routes** | Express Router | Recebe HTTP, verifica JWT/RBAC, valida Zod, delega ao Service |
| **Middleware** | `jose` + `bcryptjs` | Auth JWT: `jwtVerify` + blacklist Redis. RBAC por role do JWT. |
| **Services** | TypeScript puro | TODA lógica de negócio: máquina de estados, settlement de caução de vasilhames (v2), OTP HMAC, KPIs, assinaturas, `emitEvent()` atômico. |
| **Repositories** | Prisma 7.x | Queries via Prisma Client com `@prisma/adapter-pg`. Transações interativas. |
| **Socket.IO** | socket.io 4.x | Integrado ao servidor HTTP Express. Auth JWT no handshake. Salas `${role}:${userId}` e `distributor:${distributorId}`. |
| **Queue/Worker** | BullMQ 5.x + ioredis | Worker separado em `src/worker/index.ts`. Processa webhooks de pagamento e jobs de assinatura. |
| **Jobs HTTP** | Express Routes | `POST /api/internal/jobs/subscription`, `otp-cleanup`, `subscription-expiry`. Protegidos por `INTERNAL_JOB_SECRET`. |
| **Banco** | PostgreSQL 16 | 36 tabelas, 19 enums, triggers, índices compostos. |
| **Cache** | Redis 7 + ioredis | JWT blacklist, filas BullMQ, cache de sessão. |

#### Frontend — `apps/web` (Next.js 16, porta 3001)

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Pages** | Next.js App Router | Client Components com interatividade. Sem Server Actions de negócio. |
| **Auth/RBAC** | `proxy.ts` + `jose` | Verifica JWT do cookie `xua-token`. Redireciona por role. Controla rotas permitidas. |
| **State Server** | TanStack Query v5 | Cache de dados da API, revalidação automática, optimistic updates. |
| **State Client** | Zustand v5 | UI: carrinho, checkout multi-step, modais. Persist via localStorage. |
| **Real-time** | socket.io-client 4.x | Conecta ao servidor Socket.IO do Express. Auth token no handshake. |
| **Offline** | Service Worker + IndexedDB | PWA: cache de assets. Fila offline do motorista com sync automático. |

**Exemplo — Gateway Socket.IO no servidor Express:**

```typescript
// apps/api/src/infra/socket/gateway.ts
import { Server } from "socket.io";
import { jwtVerify } from "jose";

export function initSocketGateway(io: Server) {
  io.use(async (socket, next) => {
    // Auth JWT no handshake (token ou cookie xua-token)
    const token = socket.handshake.auth.token
      ?? socket.handshake.headers.cookie?.match(/xua-token=([^;]+)/)?.[1];
    const { payload } = await jwtVerify(token, JWT_SECRET);
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    socket.data.distributorId = payload.distributor_id;
    next();
  });

  io.on("connection", (socket) => {
    const { role, userId, distributorId } = socket.data;
    socket.join(`${role}:${userId}`);
    if (role === "distributor_admin" && distributorId) {
      socket.join(`distributor:${distributorId}`);
    }
  });
}
```

> O Socket.IO corre no mesmo servidor HTTP do Express (porta 4000). Jobs são disparados via HTTP externo — sem node-cron no processo.

### 3.2 Perfis de Acesso — RBAC

| Perfil JWT | Rotas web permitidas | Permissões |
|---|---|---|
| `consumer` | `/catalog`, `/cart`, `/checkout/*`, `/orders/*`, `/subscription/*`, `/profile/*` | Criar/visualizar seus pedidos, endereços, assinaturas. Selecionar distribuidora no checkout quando há 2+ opções. Configurar preferência de seleção automática via perfil. |
| `distributor_admin` | `/distributor/queue`, `/distributor/orders/*`, `/distributor/routes/*`, `/distributor/reconciliation`, `/distributor/kpis`, `/distributor/schedule`, `/distributor/inventory/*`, `/distributor/drivers` **[NOVO 02/08/2026]** | Aceitar/rejeitar pedidos, checklist, despacho, conciliação, KPIs, agenda semanal, inventário operacional, cadastrar/editar/desativar os próprios motoristas. |
| `driver` | `/driver/deliveries`, `/driver/deliveries/:id/*`, `/driver/history` | Executar rota, confirmar OTP, registrar troca de vasilhame, motivo de não-coleta. Opera offline. |
| `support` | `/support/*`, `/ops/otp-override` | Consultar pedidos, ver timeline de auditoria, reagendar entregas, override de OTP com motivo obrigatório. |
| `ops` | `/ops/*`, `/support/*` | Tudo do support + zonas, KPIs global, banners, produtos, planos de assinatura, exportar auditoria CSV. |

### 3.3 emitEvent() Atômico + Socket.io Pós-commit

Toda transição de estado realiza mutação + evento de auditoria na **mesma transação**. O Socket.io só emite após o commit — se houver rollback, nenhuma notificação falsa é enviada.

```typescript
// src/services/order-service.ts
async acceptOrder(orderId: string, distributorUserId: string) {
  const order = await this.db.transaction(async (trx) => {
    // 1. Mutação — mesma transação
    const [updated] = await trx("09_trn_orders")
      .where({ id: orderId })
      .update({ status: "ACCEPTED_BY_DISTRIBUTOR", accepted_at: new Date() })
      .returning("*");

    // 2. Evento de auditoria — mesma transação
    await this.auditRepo.emit({
      eventType: "ORDER_ACCEPTED_BY_DISTRIBUTOR",
      actor: { type: "distributor_user", id: distributorUserId },
      orderId,
      sourceApp: "distributor_web",
    }, trx);

    return updated;
  });

  // 3. Socket.io — SÓ após commit bem-sucedido
  const io = (global as any).__io;
  io.to(`consumer:${order.consumer_id}`).emit("order_status_changed", {
    orderId, status: "ACCEPTED_BY_DISTRIBUTOR",
  });
}
```

### 3.4 Fluxo Completo de uma Entrega

| # | Estado | Ator | O que acontece / eventos |
|---|---|---|---|
| 1 | `CREATED` | consumer | Pedido criado com itens, endereço e data. Evento: `ORDER_CREATED` |
| 2 | `PAYMENT_PENDING` | system | `CapacityService.reserve()` com `FOR UPDATE` — slot bloqueado. Evento: `ORDER_PRICING_FINALIZED` |
| 3 | `CONFIRMED` | system | Gateway aprova → `PAYMENT_CAPTURED`. (A caução financeira v1 / `DEPOSIT_HELD` foi removida em jul/2026 — não há mais retenção na 1ª compra.) |
| 4 | `SENT_TO_DISTRIBUTOR` | system | Socket.io emite `"new_order"` para sala do distribuidor. Evento: `ORDER_RECEIVED_BY_DISTRIBUTOR` |
| 5 | `ACCEPTED_BY_DISTRIBUTOR` | dist_admin | Aceite dentro do SLA. Timer para de contar. Evento: `ORDER_ACCEPTED_BY_DISTRIBUTOR` |
| 6 | `READY_FOR_DISPATCH` | dist_admin | Checklist 100% (itens + vasilhames + endereço). Evento: `DISPATCH_CHECKLIST_COMPLETED` |
| 7 | `OUT_FOR_DELIVERY` | system | OTP HMAC-SHA256 (6 dígitos, 90min, max 5). Web Push genérico ("saiu para entrega", sem o código) ao consumidor. Eventos: `OTP_GENERATED` + `ORDER_DISPATCHED` |
| 8 | `DELIVERED` | operator | OTP validado. Troca registrada (qty + condição). Eventos: `OTP_VALIDATION_ATTEMPTED` + `ORDER_DELIVERED` + `BOTTLE_EXCHANGE` |
| 9 | (pós) | system | Troca de vasilhames registrada (settlement v2). A devolução de caução financeira v1 (`DEPOSIT_REFUND_*`) não ocorre mais — removida em jul/2026. |

### 3.5 Mapa de Eventos de Auditoria (39 tipos)

| Evento | Ator | Quando é emitido |
|---|---|---|
| `ORDER_CREATED` | consumer | Pedido criado com itens e data de entrega. **Payload inclui `distributor_selection_mode: 'manual' | 'auto'`** |
| `ORDER_PRICING_FINALIZED` | system | Valores calculados (items + frete) |
| `ORDER_CONFIRMED` | system | Pagamento capturado e janela reservada com sucesso |
| `ORDER_CANCELLED` | consumer/ops | Pedido cancelado com motivo obrigatório |
| `ORDER_RECEIVED_BY_DISTRIBUTOR` | system | Pedido enviado para fila do distribuidor via Socket.io |
| `ORDER_ACCEPTED_BY_DISTRIBUTOR` | dist_user | Aceite dentro do SLA configurado |
| `ORDER_REJECTED_BY_DISTRIBUTOR` | dist_user | Rejeição com motivo obrigatório da lista |
| `ORDER_DRIVER_ASSIGNED` | dist_user | Motorista atribuído ao pedido |
| `DISPATCH_CHECKLIST_COMPLETED` | dist_user | Todos os 3 itens do checklist marcados |
| `ORDER_DISPATCHED` | dist_user | Carga saiu com `route_id` vinculado |
| `OTP_GENERATED` | system | OTP criado ao despachar (apenas hash HMAC armazenado) |
| ~~`OTP_SENT`~~ | — | **Nunca emitido** — não existe envio real (SMS ou push com o código) para auditar. O código chega ao consumidor via Socket.io (`otp_generated`, tempo real) ou fallback lendo `GET /api/orders/:id` (role `consumer`, código armazenado no Redis). O push que existe (`"Pedido saiu para entrega!"`) é só um aviso de status, sem o código — débito técnico registrado em `04-active-state.md` |
| `OTP_VALIDATION_ATTEMPTED` | driver | Tentativa de validação — sucesso ou falha registrada |
| `OTP_OVERRIDE` | ops/support | Entrega confirmada por override com motivo obrigatório |
| `ORDER_DELIVERED` | driver/support | OTP válido ou override autorizado |
| `BOTTLE_EXCHANGE_RECORDED` | driver | Coleta de vasilhame (qty + condição ok/danificado/sujo) |
| `EMPTY_NOT_COLLECTED` | driver | Não-coleta com motivo obrigatório |
| `REDELIVERY_REQUIRED` | driver | Falha de entrega com motivo |
| `REDELIVERY_SCHEDULED` | ops/support | Nova data e janela agendadas |
| `PAYMENT_CREATED` | system | Cobrança iniciada no gateway |
| `PAYMENT_CAPTURED` | system | Pagamento aprovado pelo gateway |
| `PAYMENT_FAILED` | system | Pagamento recusado com código de erro |
| `PAYMENT_EXPIRED` | system | Cobrança expirada sem pagamento |
| `PAYMENT_REFUNDED` | system | Reembolso de pagamento confirmado |
| `PAYMENT_REFUND_FAILED` | system | Falha ao processar reembolso |
| `DEPOSIT_HELD` | system | Caução financeira v1 — **não mais emitido** (removido jul/2026); valor mantido no enum por auditoria histórica |
| `DEPOSIT_REFUND_INITIATED` | system | Caução financeira v1 — **não mais emitido** (removido jul/2026) |
| `DEPOSIT_REFUNDED` | system | Caução financeira v1 — **não mais emitido** (removido jul/2026) |
| `DAILY_RECONCILIATION_CLOSED` | dist_user | Conciliação diária fechada (delta + justificativa) |
| `DEPOSIT_BOTTLES_LOANED` | system/dist_user | Caução v2: vasilhames emprestados ao consumidor |
| `DEPOSIT_BOTTLES_RETURNED` | system/driver | Caução v2: vasilhames devolvidos |
| `DEPOSIT_BOTTLES_WRITTEN_OFF` | dist_user | Caução v2: baixa de vasilhames (perda/dano) |
| `DEPOSIT_PROGRAM_ENABLED` | dist_user | Caução v2: programa habilitado para o consumidor |
| `DEPOSIT_PROGRAM_DISABLED` | dist_user | Caução v2: programa desabilitado |
| `DISTRIBUTOR_CREATED` | ops | CRUD de Distribuidor/Motorista (02/08/2026): distribuidora criada com o primeiro admin, em transação única |
| `DISTRIBUTOR_UPDATED` | ops | Distribuidora editada (inclui ativar/desativar) |
| `DRIVER_CREATED` | dist_user/ops | Motorista cadastrado (`distributor_admin` só para a própria distribuidora) |
| `DRIVER_UPDATED` | dist_user/ops | Motorista editado, inclui ativar/desativar (`is_active`) |
| `DRIVER_LINKED_TO_DISTRIBUTOR` | ops | Motorista órfão (sem `distributor_id`) vinculado a uma distribuidora |

> Os 5 eventos acima (02/08/2026) vêm da migration `20260802130000_add_consumer_is_active_and_management_audit_events` — **gerada, ainda não aplicada em nenhum banco**. Ver `doc_desenvolvimento/distribuidor-motorista-crud.md`.

### 3.6 Autenticação e Redefinição de Senha

Login via `POST /api/auth/login` gera JWT (biblioteca `jose`, payload `sub` + `role`, TTL 24h) entregue em cookie httpOnly `xua-token`. Logout adiciona o `jti` à blacklist no Redis. Registro via `POST /api/auth/register` com validação Zod compartilhada em `packages/shared`. Desde 02/08/2026, `login` rejeita com 403 "Conta desativada" quando `Consumer.is_active === false`; `markAccountDeactivated()` (mesmo mecanismo Redis de `markPasswordChanged`) invalida na hora qualquer JWT já emitido para a conta desativada.

**Fluxo "esqueci minha senha"** (`apps/api/src/modules/auth`):

1. `POST /api/auth/forgot-password` (rate limit 5/min por IP) — a resposta nunca revela se o e-mail existe (mitigação de enumeração/timing).
2. Token de 32 bytes aleatórios; apenas o hash HMAC-SHA256 (chave `PASSWORD_RESET_SECRET`) é persistido em `38_sec_password_reset_tokens`, com TTL de 30 minutos.
3. E-mail enviado via **Resend** de forma assíncrona (fire-and-forget) com link `{APP_ORIGIN}/reset-password?token=...`.
4. `POST /api/auth/reset-password` valida o token em transação atômica (UPDATE condicional), marca `used_at` (uso único), atualiza a senha e invalida os JWTs antigos via `markPasswordChanged`.

Páginas web: `(auth)/forgot-password` e `(auth)/reset-password`.

Variáveis de ambiente relacionadas à segurança: `JWT_SECRET`, `PASSWORD_RESET_SECRET`, `OTP_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET`.

### 3.7 Fluxo Cadastro → Estoque → Venda (produtos × inventário)

Desde 07/07/2026, produto criado ou reativado pela ops nasce vendável — antes, `POST /api/products` criava só o registro em `06_mst_products` e o aceite falhava com `INVENTORY_ITEM_NOT_FOUND`, exigindo INSERT manual do item de estoque.

```
POST/PATCH /api/products (ops)
        │  $transaction: produto + provisionForProduct() atômicos
        ▼
item SELLABLE_PRODUCT ativo vinculado (29_mst_inventory_items)
        │  saldo NÃO é inicializado aqui (lazy)
        ▼
carga inicial do distribuidor (INITIAL_LOAD) cria o saldo via upsertBalance
        │
        ▼
aceite do pedido movimenta estoque (ORDER_ACCEPT_OUT)
```

Regras e responsabilidades:

- **Invariante:** produto ativo ⇒ exatamente 1 item de estoque vendável ativo vinculado (exigida por `resolveOrderInventoryLines` no aceite). Regra aplicacional — sem constraint de banco.
- **`products.service`** orquestra a transação (`create`/`update`; no update, provisiona quando o produto resultante está ativo — reativar produto legado provisiona sozinho). Cache `products:active` invalidado pós-commit.
- **`inventory-item-provisioning.service`** é dono da regra: idempotente por `product_id` (1 ativo → no-op; >1 ativo → warn + no-op; só inativos → reativa o mais recente; nenhum → cria). Sempre `SELLABLE_PRODUCT`, para todos os `ProductKind` — nunca `RETURNABLE_*`, que são singletons globais do settlement de caução. Não propaga `name`/`is_active` do produto para o item (deliberado).
- **Repositórios** sem lógica de negócio (`findInventoryItemsByProductId`, `findInventoryItemByCode`, `createInventoryItem`, `reactivateInventoryItem`; constante `SELLABLE_INVENTORY_ITEM_TYPES` compartilhada com o resolver de pedidos).
- **Legados:** `scripts/backfill-product-inventory-items.ts` (`--dry-run` disponível) provisiona produtos ativos sem item vendável ativo, uma transação por produto.

---

## 4. Plano de Desenvolvimento — 2 Devs, 4 Semanas

**Dev A:** backend (Services, banco, Route Handlers, testes, Socket.io, cron)
**Dev B:** frontend (páginas Next.js, componentes shadcn/ui, hooks, stores, PWA)

Como tudo é um repo só, a integração é instantânea — Dev B chama o Service diretamente via Server Action.

### Semana 1 — Fundação: Banco, Auth, Estrutura Next.js

| Dev A — Backend / Services | Dev B — Frontend / UI |
|---|---|
| Next.js 15 + custom server (`server.ts` com Socket.io) | shadcn/ui init + Tailwind CSS + componentes base (Button, Input, Card, Badge, Dialog) |
| Docker Compose: PostgreSQL 16 + Redis 7 | Estrutura: `app/(auth)`, `(consumer)`, `(distributor)`, `(driver)`, `(ops)` com layouts |
| Migrations 01–18 completas (enums primeiro, depois tabelas) | `middleware.ts`: JWT cookie + RBAC + redirect por role |
| Seed: produto 20L, distribuidor piloto, zonas, capacidade 30 dias | `store/auth.ts` (Zustand): login/logout + `store/cart.ts`: carrinho persistente |
| Auth: register, login, refresh, logout com blacklist Redis | `services/api/client.ts`: fetch wrapper com interceptor JWT auto-refresh |
| Middleware RBAC: `requireRole()` nos Route Handlers | Páginas `/login` e `/register` com React Hook Form + validação Zod |
| `ZoneService` + `CapacityService` com `SELECT FOR UPDATE` | Componentes shared: `StatusPill`, `OtpInput` (6 dígitos), `SlaCounter`, `OfflineBanner` |
| `emitEvent(payload, trx)` com validação Zod dos 24 event_types | `lib/utils.ts`: `formatCurrency(BRL)`, `formatDate(pt-BR)`, `lib/cep.ts`: ViaCEP fetch |
| Teste de concorrência: 10 checkouts simultâneos → só N passam | Componente `shared/page-header.tsx` + `shared/data-table.tsx` (reutilizável) |

> **Milestone:** API testável + login funcionando + middleware RBAC redirecionando por perfil no navegador

### Semana 2 — Pedidos, Pagamento e Área do Consumidor

> Nota histórica: este cronograma reflete o plano original. Os itens de caução financeira v1 (`DepositBanner`, `DepositService`, "resumo produto+frete+caução", badge caução no perfil) foram **removidos em jul/2026** — a caução atual é por vasilhames (v2).

| Dev A — Backend / Services | Dev B — Frontend / UI |
|---|---|
| `OrderService` completo: `createOrder`, `submitForPayment`, `confirmOrder` | Página `/profile/addresses`: CEP + ViaCEP autocomplete + detecção zona automática |
| `OrderService`: `sendToDistributor`, `acceptOrder`, `rejectOrder` | Página `/catalog`: ProductCard com preço, badge disponibilidade, botão adicionar |
| `OrderService`: `completeChecklist`, `dispatch`, `deliverOrder`, `failDelivery`, `cancelOrder` | Página `/cart`: seletor qty + campo obrigatório "garrafões vazios" + DepositBanner 1ª compra |
| `BottleService`: `recordExchange(qty, condition)`, `recordNonCollection(reason)` | Página `/checkout/schedule`: Calendar shadcn + pills manhã/tarde + disabled se esgotado |
| `IPaymentGateway` interface + adapter concreto do gateway escolhido | Página `/checkout/payment`: resumo (produto+frete+caução) + SDK gateway + retry em falha |
| `PaymentService.charge()` + Route Handler `/api/payments/[id]/webhook` (idempotente) | Página `/checkout/confirmation`: animação sucesso + botão "ver pedido" |
| `DepositService`: `holdDeposit()` na 1ª compra + `releaseDeposit()` Regra A | Página `/orders/[id]`: `OrderTimeline` vertical + `OtpDisplay` quando `OUT_FOR_DELIVERY` + `NpsForm` |
| Socket.io: salas `consumer:{id}` e `distributor:{id}` no custom server | Hook `useSocket`: escuta `"order_status_changed"` → invalida cache TanStack Query |
| `KpiService`: `slaAcceptance`, `acceptanceRate`, `redeliveryRate` via audit_events | Página `/orders`: lista paginada + filtros + botão "Repetir pedido" (1 clique → preenche carrinho) |

> **Milestone:** Pedido completo: catálogo → carrinho → agendamento → pagamento → OTP visível no navegador

### Semana 3 — Distribuidor, Motorista e Offline (PWA)

| Dev A — Backend / Services | Dev B — Frontend / UI |
|---|---|
| `OtpService`: `generate()` HMAC-SHA256, `validate()` com lock, `generateOverride()` | Página `/distributor/queue`: `OrderQueueCard` + `SlaCountdown` (vermelho <60s, pulse animation) |
| OTP disparado ao despachar → Web Push ao consumidor | Página `/distributor/orders/[id]`: split-view info+ações. `RejectDialog` com select motivo obrigatório |
| `NotificationService`: Web Push nos estados críticos do pedido | Página `/distributor/orders/[id]/checklist`: 3 checkboxes + Progress + Despachar bloqueado até 100% |
| `SubscriptionService`: CRUD + cron 06h no `server.ts` (timezone SP) | Página `/distributor/routes/[id]`: RouteStopCards por zona/janela + link Google Maps |
| Cron: expiração OTP cada 15min (`active → expired`) no `server.ts` | Página `/driver/deliveries`: DeliveryCards offline + OfflineBanner com qtd eventos na fila |
| Route Handler `GET /api/driver/deliveries` (filtro por data + motorista) | Página `/driver/deliveries/[id]/otp`: 6 inputs auto-focus + shake animation + contador tentativas |
| Route Handler `POST /api/reconciliations` + `GET summary` | Página `/driver/.../exchange`: stepper qty→condição + `/non-collection`: select obrigatório + textarea |
| Testes E2E: fluxo pedido→entrega + idempotência webhook | Service Worker (Workbox): cache assets + IndexedDB (idb): fila offline do motorista |
| Socket.io: evento `"sla_warning"` para distribuidor quando SLA < 60s | Hook `useOfflineSync`: detecta reconexão → processa fila → banner progresso → limpa |

> **Milestone:** Entrega confirmada via OTP no navegador + sync offline testado com internet desligada

### Semana 4 — Assinatura v2, Segurança, Testes e Go-Live

| Dev A — Backend / Services | Dev B — Frontend / UI |
|---|---|
| Rate limiting: 100/min global, 30/min orders, 10/min auth/login | Página `/subscription/create`: wizard 5 etapas (Plano → Distribuidor → Endereço → Datas → Pagamento) |
| Módulo `subscription-plans`: CRUD de planos (`GET/POST /api/subscription-plans`, `PATCH /api/subscription-plans/:id`) — apenas ops mutaciona | Página `/subscription/manage`: cards por assinatura com status, saldo restante, datas agendadas + ações pausar/retomar/cancelar |
| Módulo `user-subscriptions`: `POST /api/user-subscriptions` cria assinatura com validações (plano ativo, distribuidor vinculado, soma de quantidades = plan.quantity, datas dentro do período válido) | Página `/ops/subscription-plans`: CRUD de planos com seletor multi-distribuidoras, configuração de preço, datas de validade e produto |
| `subscription-expiry-job.ts`: job HTTP cron que notifica via push quando `remaining_quantity ≤ 3` e `low_balance_notification_sent_at` for nulo (idempotente) | `useSubscriptionStore` (Zustand + persist): estado do wizard (`selectedPlanId`, `selectedDistributorId`, `selectedAddressId`, `selectedDates`, `timeSlotsByDate`, `quantitiesByDate`, `paymentMethod`) |
| Headers segurança em `next.config.ts` (X-Frame-Options, CSP, HSTS) | Componente `SubscriptionCalendar`: seleção de múltiplas datas dentro do período válido do plano |
| Validação HMAC assinatura do webhook do gateway | Página `/orders`: histórico paginado + filtro status + "Repetir pedido" que copia carrinho |
| Schemas Zod para todos os event_types do audit | Componente `NpsForm`: 5 estrelas clicáveis + textarea + nota 1–2 abre link suporte |
| Testes de carga: 50 checkouts simultâneos no mesmo slot | Página `/profile`: dados + lista endereços (padrão marcado) + badge caução (retida/devolvida) |
| Dockerfile multi-stage + graceful shutdown `SIGTERM` | `manifest.json` (PWA) + Service Worker + teste em dispositivo real |

> **Milestone:** Plataforma em produção — pedido real pago, entregue via OTP, KPIs no dashboard, assinatura v2 contratável pelo consumidor

---

## 5. Módulo de Assinaturas v2 — Planos Pré-definidos

> **Atenção:** a assinatura oficial do sistema é a v2, baseada em planos pré-configurados pela ops. O modelo legado de recorrência simples foi removido do schema e do código ativo.

### 5.1 Visão Geral do Fluxo

```
Ops cria SubscriptionPlan  →  Consumer escolhe plano  →  Seleciona distribuidor do plano
→  Seleciona endereço  →  Distribui qtd pelas datas  →  Escolhe pagamento
→  POST /api/user-subscriptions  →  UserSubscription criada (PENDING_PAYMENT → ACTIVE)
```

**Geração de pedidos (Fases 1 e 2 — implementadas):**

- **Fase 1 — geração atômica:** ao ativar a assinatura (webhook de pagamento) e via cron de segurança, o worker cria o pedido já confirmado (valor 0, pago pela assinatura) para cada data agendada. A data passa a `ORDER_CREATED` com `order_id` preenchido; o pedido segue o fluxo normal (`SENT_TO_DISTRIBUTOR` → ... → `DELIVERED`). Geração idempotente.
- **Fase 2 — compensação:** se o pedido é rejeitado ou cancelado, a quantidade é recreditada e uma nova tentativa é agendada. `generation_attempts` conta as tentativas; após 3 falhas a data vira `FAILED` e o consumidor é notificado. Quando todas as entregas concluem, a assinatura passa a `COMPLETED`; assinaturas `PENDING_PAYMENT` não pagas expiram via job.

### 5.2 Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/subscription-plans` | qualquer auth | Lista planos. `?activeOnly=true` (padrão) filtra apenas ativos |
| `GET` | `/api/subscription-plans/:id` | qualquer auth | Detalhes de um plano |
| `POST` | `/api/subscription-plans` | ops only | Cria plano com `distributor_ids[]` |
| `PATCH` | `/api/subscription-plans/:id` | ops only | Atualiza plano (campos parciais + `distributor_ids`) |
| `GET` | `/api/user-subscriptions` | consumer | Lista assinaturas do consumidor autenticado |
| `POST` | `/api/user-subscriptions` | consumer | Cria assinatura a partir de um plano |
| `GET` | `/api/user-subscriptions/:id` | consumer | Detalhes de uma assinatura |
| `PATCH` | `/api/user-subscriptions/:id/cancel` | consumer | Cancela assinatura |
| `PATCH` | `/api/user-subscriptions/:id/pause` | consumer | Pausa assinatura |
| `PATCH` | `/api/user-subscriptions/:id/resume` | consumer | Retoma assinatura pausada |

### 5.3 Payload de Criação — `POST /api/user-subscriptions`

```json
{
  "plan_id": "uuid",
  "distributor_id": "uuid",
  "address_id": "uuid",
  "delivery_dates": [
    { "date": "2026-06-10", "time_slot_id": "uuid", "quantity": 2 },
    { "date": "2026-06-24", "time_slot_id": "uuid", "quantity": 1 }
  ],
  "payment_method": "pix"
}
```

### 5.4 Regras de Validação (service)

1. **Plano ativo:** `plan.is_active === true`.
2. **Distribuidor vinculado:** `distributor_id` deve constar em `SubscriptionPlanDistributor` para o plano.
3. **Soma de quantidades:** soma de `delivery_dates[].quantity` deve ser exatamente `plan.quantity`.
4. **Datas dentro do período:** toda data em `delivery_dates` deve estar entre `plan.valid_from` e `plan.valid_until`.

### 5.5 Ciclo de Vida da Assinatura

| Status | Descrição |
|---|---|
| `PENDING_PAYMENT` | Criada, aguardando confirmação de pagamento |
| `ACTIVE` | Pagamento confirmado; entregas sendo processadas |
| `PAUSED` | Consumidor pausou; entregas suspensas temporariamente |
| `CANCELLED` | Cancelada (consumidor ou ops) |
| `COMPLETED` | `remaining_quantity === 0`; todas as entregas realizadas |

### 5.6 Job de Saldo Baixo (`subscription-expiry-job`)

- Rota HTTP: `POST /api/internal/jobs/subscription-expiry` (protegida por `INTERNAL_JOB_SECRET`)
- Gatilho: Render Cron Job (ou equivalente)
- Critério: `status = ACTIVE AND remaining_quantity ≤ 3 AND low_balance_notification_sent_at IS NULL`
- Ação: envia push notification → atualiza `low_balance_notification_sent_at = now()` (idempotente)

### 5.7 Frontend — Wizard de Criação (`/subscription/create`)

| Etapa | O que o consumidor faz |
|---|---|
| **0 — Plano** | Escolhe entre os planos ativos. Exibe nome, produto, quantidade, desconto e preço total. |
| **1 — Distribuidor** | Seleciona uma das distribuidoras vinculadas ao plano escolhido. |
| **2 — Endereço** | Abre `AddressSheet` para selecionar ou cadastrar endereço. |
| **3 — Datas** | Usa `SubscriptionCalendar` para marcar datas. Para cada data: escolhe faixa horária e quantidade. Barra de progresso mostra produtos distribuídos vs. total do plano. |
| **4 — Pagamento** | Escolhe método via `PaymentMethodSelector` (Pix / Cartão / Dinheiro). Exibe resumo final. |

Estado persistido em `useSubscriptionStore` (Zustand persist `"xua-subscription"`).

### 5.8 Frontend — Gestão (`/subscription/manage`)

- Lista todas as `UserSubscription` do consumidor com: status badge, plano, distribuidor, datas agendadas, saldo restante.
- Ações por card: **Pausar**, **Retomar**, **Cancelar** (dialog de confirmação).
- Detalhe das datas de entrega com status individual por entrega (`PENDING`, `ORDER_CREATED`, `DELIVERED`, `FAILED`, `CANCELLED`).

### 5.9 Frontend — Painel Ops (`/ops/subscription-plans`)

- CRUD completo de planos: criar, editar, ativar/desativar.
- Seletor multi-distribuidoras (`MultiSelect`).
- Campos: nome, descrição, produto, quantidade, desconto %, preço com desconto, datas de vigência.

---

## 6. Tecnologias Recomendadas

| Categoria | Tecnologia | Justificativa |
|---|---|---|
| Runtime | Node.js 22 LTS | LTS ativo, ESM nativo, Web Streams, performance superior |
| Linguagem | TypeScript 5.x strict | Tipagem forte end-to-end (frontend + backend no mesmo projeto) |
| Framework | Next.js 15 (App Router) | SSR, RSC, Route Handlers, Server Actions, Middleware — tudo built-in |
| Custom Server | `server.ts` (http + next) | Permite Socket.io + cron no mesmo processo. Deploy Railway/VPS. |
| UI | shadcn/ui + Radix UI | Componentes acessíveis, customizáveis, copy-paste (sem lock-in) |
| CSS | Tailwind CSS 3.4 | Utility-first, mobile-first nativo, purge automático |
| State Server | TanStack Query v5 | Cache, revalidação, optimistic updates, dedup de requests |
| State Client | Zustand v5 | 1KB, sem boilerplate, persist middleware, zero context hell |
| Forms | React Hook Form + Zod | Performance + validação tipada + schemas compartilhados client/server |
| DB Access | Prisma 7.x | ORM type-safe com migrations, transações interativas, schema declarativo |
| Banco | PostgreSQL 16 | 36 tabelas, 19 enums, trigger de proteção de status |
| Cache | Redis 7 + ioredis | JWT blacklist, cache catálogo 5min, OTP TTL 90min |
| Real-time | Socket.io 4.x | No servidor Express (porta 4000). Salas por usuário. Reconnect automático. |
| Jobs | BullMQ + scheduler HTTP externo | Worker separado; endpoints `/api/internal/jobs/*` protegidos por `INTERNAL_JOB_SECRET` |
| E-mail | Resend | Redefinição de senha e notificações transacionais |
| Validação | Zod 3.x | Schema === Type. Mesmo Zod valida form no browser e request no server. |
| Push Web | Web Push API + SW | Notificações nativas do navegador. Substitui FCM Android. |
| Offline | PWA Workbox + idb | Cache assets + fila IndexedDB motorista + sync automático |
| Gráficos | Recharts | Declarativo, React-nativo, perfeito para KPI dashboards |
| Ícones | Lucide React | Consistente com shadcn, tree-shakeable, 1000+ ícones |
| Logs | Pino 9.x | 30x mais rápido que winston, JSON nativo, correlation-id |
| Testes | Vitest + Supertest | Vite-powered, ESM nativo, mock built-in |
| Deploy | Railway (Docker) | Um deploy: frontend + API + Socket.io + cron. PostgreSQL gerenciado. |
| Segredos | Doppler ou env | Cofre centralizado. Nunca `.env` no git. |

---

## 6. Riscos Técnicos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Gateway sandbox demora aprovação | Alto | Escolher provider semana 0, criar conta antes de S2. Plano B identificado. |
| Race condition — overbooking | Alto | `SELECT FOR UPDATE` obrigatório. Teste 10 req simultâneas S1. 409 pro segundo. |
| Webhook duplicado cobra 2x | Alto | `INSERT ON CONFLICT DO NOTHING`. `UNIQUE(provider, event_ref)`. |
| OTP texto claro no banco | Alto | HMAC-SHA256 + `OTP_SECRET` em env. Teste unitário obrigatório S1. |
| Web Push não chega | Médio | SMS fallback no `NotificationService`. Teste dispositivo real S3. |
| Offline sync duplica eventos | Médio | UUID v4 gerado no browser. Servidor valida unicidade. Idempotente. |
| Migrations atrasam | Médio | Prioridade absoluta dia 1 S1. Dev A não começa services sem migrations. |
| Service Worker cache desatualizado | Baixo | Workbox stale-while-revalidate + versionamento manifest. |
| Custom server limita scale horizontal | Baixo | Suficiente para MVP. Pós-MVP: extrair Socket.io para serviço dedicado se necessário. |

---

## 7. Melhorias Futuras (pós-MVP)

| Prioridade | Funcionalidade | Valor / Notas |
|---|---|---|
| Alta | Painel Web Operações completo | Configurar zonas sem dev. Rotas `/ops/*` já preparadas. |
| Alta | Dashboard KPIs com gráficos | `KpiService` pronto, falta UI Recharts completa. |
| Alta | Console suporte com busca | Resolver chamados sem acesso ao banco. Timeline `audit_events` pronta. |
| Alta | Roteirização inteligente | Google Directions API ou OSRM. Reduz custo/entrega. |
| Média | GPS motorista tempo real | Geolocation API browser + Socket.io room. |
| Média | Scanner vasilhames (Regra B) | QR code via câmera browser. Rastreabilidade individual. |
| Média | Incentivos e penalidades | Baseado nos KPIs já calculados. |
| Média | App nativo (React Native) | Reutiliza 100% da API e Services. |
| Baixa | Fidelidade com pontos | Nova tabela + service, sem impacto no fluxo. |
| Baixa | Múltiplos SKUs | `06_mst_products` já suporta. |
| Baixa | Analytics: cohort, churn, LTV | Tudo via `18_aud_audit_events`. |

---

*Xuá Delivery — Guia Técnico v4.2 (Monorepo Express + Next.js)*
*Zanart · Última atualização: 02 de agosto de 2026*
*36 tabelas · 19 enums · 14 estados · 39 eventos · 5 perfis RBAC*
*02/08/2026: CRUD de Distribuidor/Motorista — schema+backend+frontend completos, migration `20260802130000` gerada e NÃO aplicada (aguardando credenciais de DEV). Ver `doc_desenvolvimento/distribuidor-motorista-crud.md`.*
