# Xuá Delivery — Guia Técnico Completo
## Banco de Dados · Arquitetura · Plano de Desenvolvimento

> **ZANART — Soluções em Desenvolvimento de Software · Confidencial**

| | |
|---|---|
| **Stack** | Next.js 15 fullstack (App Router + Route Handlers + Server Actions) |
| **Banco** | PostgreSQL 16 (schema idêntico — 21 tabelas, 9 enums, 28 índices) |
| **UI** | shadcn/ui + Tailwind CSS + Radix UI (mobile-first responsivo) |
| **Real-time** | Socket.io 4.x embutido no mesmo servidor Next.js |
| **Deploy** | Railway ou VPS (servidor persistente para WebSocket + cron) |
| **Equipe** | 2 desenvolvedores · 4 semanas |
| **Versão** | 3.0 — Março 2026 (arquitetura fullstack unificada) |

**21** tabelas · **13** estados/pedido · **24** tipos/evento · **5** perfis/RBAC

---

## 1. Visão Geral do Sistema

O Xuá Delivery é uma plataforma de delivery de água mineral em garrafão retornável 20L. Na versão 3.0, todo o sistema roda em um único projeto **Next.js 15**: o frontend (React Server Components + Client Components), a API (Route Handlers), a lógica de negócio (Services), o banco de dados (PostgreSQL via Prisma ORM), o real-time (Socket.io embutido via custom server) e os cron jobs (node-cron). Não existe servidor Node.js separado — tudo é um deploy só.

O banco de dados é **compatível** com o schema original: 21 tabelas (19 originais + 2 de agenda), 9 enums, 28 índices, trigger de proteção contra regressão de estado. A única alteração no enum é em `source_app`, que agora registra `consumer_web`, `distributor_web` e `driver_web` ao invés das versões mobile.

### Superfícies e Responsabilidades

| Superfície | Perfil JWT | Responsabilidades |
|---|---|---|
| **Área do Consumidor** — Web mobile-first | `consumer` | Realizar pedidos, pagamento integrado, agendar janela de entrega (manhã/tarde), **selecionar distribuidora quando há 2 ou mais opções disponíveis** (com auto-skip se ≤1), acompanhar status em tempo real via Socket.io, gerenciar assinatura mensal, visualizar OTP de entrega, avaliar pedido (NPS 5 estrelas), **configurar preferência de distribuidora automática no perfil** |
| **Área do Distribuidor** — Web responsivo | `distributor_admin` | Receber pedidos com SLA countdown (vermelho <60s), aceitar/recusar com motivo obrigatório, checklist de saída (3 itens, bloqueio até 100%), despachar pedido (gera OTP), lista de paradas, conciliação diária de vasilhames, dashboard de KPIs |
| **Módulo Motorista** — Web PWA (offline) | `operator` | Executar rota de entregas, confirmar entrega via OTP 6 dígitos (max 5 tentativas, TTL 90min), registrar troca de vasilhame (qty + condição: ok/danificado/sujo), motivo de não-coleta obrigatório, operar offline com fila IndexedDB + sync automático ao reconectar |
| **Painel de Operações** — Web desktop | `ops` / `support` | Configurar zonas e capacidade por data/janela, dashboard KPIs de todos distribuidores (Recharts), console de suporte (busca telefone/email/order_id + timeline de audit_events), reagendar entregas, override de OTP com motivo obrigatório, exportar auditoria CSV |

### Arquitetura Unificada — tudo no Next.js

```
Navegador (Consumidor / Distribuidor / Motorista / Ops)
  React Server Components + Client Components + shadcn/ui
              ↓ fetch / Server Actions / Socket.io client

         Next.js 15 — Servidor Único
  Route Handlers (API) + Server Actions (mutações)
        + Socket.io Server + Cron Jobs
    ↓ Prisma ORM (transações) / ioredis / SDK gateway

  ┌─────────────────┬──────────────────┬──────────────────────┐
  │  PostgreSQL 16  │    Redis 7       │  Gateway Pagamento   │
  │  21 tabelas     │  Sessões JWT     │  Webhooks            │
  │  triggers       │  cache OTP TTL   │  idempotentes        │
  │  enums · índices│  blacklist       │  Caução automática   │
  └─────────────────┴──────────────────┴──────────────────────┘
```

> Zero servidor separado — Route Handlers, Socket.io, cron jobs e Services rodam no mesmo processo Next.js.

**Diferença da v2.0 para v3.0:** Na v2.0 existiam dois projetos: frontend Next.js + backend Node.js (Fastify) separados. Na v3.0, tudo é um projeto só. Os Route Handlers do Next.js substituem as rotas Fastify. Os Server Actions substituem fetch para mutações simples. O Socket.io roda via custom server do Next.js. O deploy é um comando só: `railway up` ou `docker compose up`. O banco PostgreSQL e todos os schemas permanecem inalterados.

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

Tipos: `mst` (master), `cfg` (config), `trn` (transacional), `piv` (pivot N:N), `sec` (segurança), `aud` (auditoria append-only).

> O schema é **compatível com o original** — 3 campos foram adicionados: `auto_assign_distributor` e `preferred_distributor_id` em `01_mst_consumers`; `allows_consumer_choice` em `03_mst_distributors`. Além disso, 2 tabelas novas foram criadas: `22_cfg_distributor_schedule` (agenda semanal) e `23_cfg_distributor_blocked_dates` (datas bloqueadas). Demais tabelas, constraints, índices e triggers permanecem intactos.

### 2.1 Mapa de Tabelas

| Tabela | Tipo | Responsabilidade |
|---|---|---|
| `01_mst_consumers` | mst | Cadastro de consumidores B2C e B2B. **Campos adicionados: `auto_assign_distributor` (bool, default true) e `preferred_distributor_id` (uuid nullable)** |
| `02_mst_addresses` | mst | Endereços de entrega por consumidor (múltiplos) |
| `03_mst_distributors` | mst | Parceiros distribuidores que operam as entregas. **Campo adicionado: `allows_consumer_choice` (bool, default false) — habilita a distribuidora para aparecer no seletor do consumidor** |
| `04_mst_zones` | mst | Regiões de cobertura por distribuidor |
| `05_mst_zone_coverage` | mst | Bairros e CEPs cobertos por cada zona |
| `06_mst_products` | mst | Catálogo de SKUs (MVP: apenas garrafão 20L) |
| `07_cfg_delivery_capacity` | cfg | Slots de capacidade por zona + data + janela (anti-overbooking com `SELECT FOR UPDATE`) |
| `08_sec_consumer_push_tokens` | sec | Tokens Web Push API para notificações no navegador (substitui FCM Android) |
| `09_trn_orders` | trn | Pedido principal — núcleo da máquina de estados (13 estados, trigger de proteção) |
| `10_trn_order_items` | trn | Itens de cada pedido (SKU, qty, preço snapshot no momento da compra) |
| `11_trn_subscriptions` | trn | Assinaturas mensais de reposição automática (cron diário 06h) |
| `12_piv_subscription_orders` | piv | Pivot N:N: liga assinaturas → pedidos gerados automaticamente |
| `13_trn_payments` | trn | Registro de cobranças — provider-neutral (troca de gateway sem migração de dados) |
| `14_cfg_payment_webhook_events` | cfg | Idempotência de webhooks: `UNIQUE` + `ON CONFLICT DO NOTHING` |
| `15_trn_deposits` | trn | Caução de vasilhame — Regra A: libera quando `DELIVERED` + `collected_empty_qty ≥ 1` |
| `16_sec_order_otps` | sec | OTPs de entrega: hash HMAC-SHA256, TTL 90min, max 5 tentativas, status `locked` |
| `17_trn_reconciliations` | trn | Conciliação diária: saídas vs retornos, delta calculado, justificativa obrigatória se > 0 |
| `18_aud_audit_events` | aud | **APPEND-ONLY** — fonte de verdade para KPIs, disputas e auditoria. Nunca UPDATE/DELETE. |
| `22_cfg_distributor_schedule` | cfg | **[NOVO]** Agenda semanal por distribuidora. Cada dia da semana pode ser ativado/desativado com `lead_time_hours` (antecedência mínima para aceitar pedidos). Constraint `UNIQUE(distributor_id, day_of_week)`. |
| `23_cfg_distributor_blocked_dates` | cfg | **[NOVO]** Datas bloqueadas por distribuidora (feriados, manutenção, etc.) com motivo opcional. Constraint `UNIQUE(distributor_id, blocked_date)`. |

### 2.2 Relacionamentos Principais

| Origem | Cardinalidade | Destino | Regra |
|---|---|---|---|
| `01_mst_consumers` | 1 : N | `02_mst_addresses` | Múltiplos endereços por consumidor |
| `01_mst_consumers` | 1 : N | `09_trn_orders` | Histórico de pedidos do consumidor |
| `03_mst_distributors` | 1 : N | `04_mst_zones` | Distribuidor cobre uma ou mais zonas |
| `04_mst_zones` | 1 : N | `07_cfg_delivery_capacity` | Capacidade configurada por dia e janela |
| `09_trn_orders` | 1 : N | `10_trn_order_items` | Pedido tem um ou mais produtos |
| `09_trn_orders` | 1 : 1 | `13_trn_payments` | Cada pedido gera exatamente uma cobrança |
| `09_trn_orders` | 1 : 0..1 | `15_trn_deposits` | Caução apenas na primeira compra |
| `09_trn_orders` | 1 : N | `16_sec_order_otps` | Novo OTP a cada tentativa de entrega |
| `11_trn_subscriptions` | N : N | `09_trn_orders` | Via `12_piv_subscription_orders` |
| `09_trn_orders` | 1 : N | `18_aud_audit_events` | Todo evento gravado com timestamp |
| `03_mst_distributors` | 1 : N | `22_cfg_distributor_schedule` | Agenda semanal (7 registros possíveis por distribuidora) |
| `03_mst_distributors` | 1 : N | `23_cfg_distributor_blocked_dates` | Datas bloqueadas para a distribuidora |

### 2.3 Enums PostgreSQL

| Enum | Valores |
|---|---|
| `delivery_window` | `morning` \| `afternoon` |
| `order_status` | `DRAFT` \| `CREATED` \| `PAYMENT_PENDING` \| `CONFIRMED` \| `SENT_TO_DISTRIBUTOR` \| `ACCEPTED_BY_DISTRIBUTOR` \| `REJECTED_BY_DISTRIBUTOR` \| `PICKING` \| `READY_FOR_DISPATCH` \| `OUT_FOR_DELIVERY` \| `DELIVERED` \| `DELIVERY_FAILED` \| `REDELIVERY_SCHEDULED` \| `CANCELLED` |
| `otp_status` | `active` \| `used` \| `expired` \| `locked` |
| `subscription_status` | `active` \| `paused` \| `cancelled` |
| `payment_kind` | `order` \| `subscription` \| `deposit` |
| `payment_status` | `created` \| `authorized` \| `captured` \| `failed` \| `refunded` |
| `deposit_status` | `held` \| `refund_initiated` \| `refunded` \| `forfeited` |
| `actor_type` | `consumer` \| `distributor_user` \| `driver` \| `support` \| `ops` \| `system` |
| `source_app` | `consumer_web` \| `distributor_web` \| `driver_web` \| `ops_console` \| `backend` |

> ⚠️ ENUMs criados **ANTES** de qualquer tabela (bloco 00 do schema). Única alteração: `source_app` agora usa `consumer_web`, `distributor_web`, `driver_web`. Demais tabelas e enums 100% idênticos.

### 2.4 Regras Críticas do Banco

**Anti-overbooking:** `07_cfg_delivery_capacity`: `UNIQUE(zone_id, delivery_date, window)` + `CHECK(reserved <= total)`. Reserva usa `SELECT FOR UPDATE` na mesma transação. Dois checkouts simultâneos: um passa, outro recebe 409.

**Idempotência de webhook:** `14_cfg_payment_webhook_events`: `UNIQUE(provider, provider_event_ref)`. `INSERT ON CONFLICT DO NOTHING` — duplicado ignorado automaticamente.

**Caução — Regra A:** `15_trn_deposits`: `held → refund_initiated` somente quando `status = DELIVERED AND collected_empty_qty ≥ 1`. Validação no `DepositService` — **nunca no frontend**.

**OTP com hash:** `16_sec_order_otps`: `otp_hash = HMAC-SHA256(codigo, OTP_SECRET)`. Texto claro **NUNCA** persistido. Max 5 tentativas, TTL 90min. Após 5 erros → `locked` → só override ops/support.

**Audit append-only:** `18_aud_audit_events`: **NUNCA** recebe UPDATE ou DELETE. Fonte de verdade para KPIs, disputas e auditoria. Todos os Services gravam aqui na mesma transação da mutação de estado.

**Trigger de proteção:** `trg_09_trn_orders_status_regression`: Bloqueia transição a partir de `DELIVERED` e `CANCELLED`. Proteção em nível de banco, independente da aplicação.

**Exemplo — Anti-overbooking com SELECT FOR UPDATE:**

```sql
-- CapacityService.reserve() — dentro de transação Prisma
BEGIN;
SELECT id, capacity_total, capacity_reserved
  FROM 07_cfg_delivery_capacity
 WHERE zone_id = $1 AND delivery_date = $2 AND window = $3
   FOR UPDATE; -- bloqueia a linha até o COMMIT

IF capacity_reserved >= capacity_total THEN
  RAISE EXCEPTION 'SLOT_FULL'; -- Route Handler retorna 409
END IF;

UPDATE 07_cfg_delivery_capacity
   SET capacity_reserved = capacity_reserved + 1, updated_at = now()
 WHERE zone_id = $1 AND delivery_date = $2 AND window = $3;
COMMIT;
```

---

## 3. Arquitetura do Sistema — Next.js Fullstack Unificado

> **Regra de ouro:** nenhuma lógica de negócio fora da camada de Services. Route Handlers validam input (Zod) e delegam. Server Actions fazem o mesmo para mutações do formulário. Repositories apenas persistem. O Socket.io roda no mesmo processo via custom server.

### 3.1 Camadas do Sistema

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Pages (RSC)** | Next.js App Router | Renderização SSR/CSR. Server Components por padrão. Client Components só com interatividade (forms, modais, Socket.io). |
| **State Server** | TanStack Query v5 | Cache automático, revalidação, optimistic updates, prefetch em Server Components. Toda busca de dados passa por aqui. |
| **State Client** | Zustand v5 | Apenas UI: carrinho, sidebar, modais, theme. Persist middleware para localStorage. Zero server state. |
| **Forms** | React Hook Form + Zod | Validação tipada no client e server (schemas compartilhados no mesmo repo). Integração nativa com shadcn/ui Form. |
| **Route Handlers** | Next.js API Routes | `app/api/**/route.ts` — recebe HTTP, valida Zod, chama Service, retorna JSON. Substitui Fastify routes. |
| **Server Actions** | Next.js (`use server`) | Mutações simples: aceitar pedido, marcar checklist, submit rating. Elimina fetch manual pro Route Handler. |
| **Middleware** | Next.js `middleware.ts` | Auth JWT via cookie httpOnly. RBAC por role. Redirect automático: consumer→/catalog, driver→/deliveries. |
| **Services** | TypeScript puro | TODA lógica de negócio: máquina de estados, caução (Regra A), OTP HMAC, KPIs, assinaturas, `emitEvent()` atômico. |
| **Repositories** | Prisma 7.x | Queries via Prisma Client. Transações interativas (`prisma.$transaction`). Sem regra de negócio. |
| **Infra** | fetch + SDKs | Gateway pagamento (interface desacoplada), Web Push API, SMS fallback. Troca de provider sem alterar Services. |
| **Real-time** | Socket.io 4.x (embutido) | Custom server Next.js: mesmo processo, mesmo port. Salas `consumer:{id}`, `distributor:{id}`. Reconnect automático. |
| **Cron** | node-cron 3.x | Roda no mesmo processo: assinaturas 06h (São Paulo), OTP cleanup cada 15min. Sem worker separado. |
| **Banco** | PostgreSQL 16 | 21 tabelas, 9 enums, 28 índices, trigger de proteção. Schema compatível (2 tabelas de agenda adicionadas). |
| **Cache** | Redis 7 + ioredis | Sessões JWT (blacklist), cache catálogo (5min), TTL de OTP (90min). |
| **Offline** | Service Worker + IndexedDB | PWA (Workbox): cache assets. idb: fila offline motorista. Sync automático ao reconectar. |

**Exemplo — Custom server Next.js com Socket.io embutido:**

```typescript
// server.ts — roda no mesmo processo que o Next.js
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketServer } from "socket.io";
import cron from "node-cron";
import { subscriptionCron } from "./src/services/subscription-cron";
import { otpCleanupCron } from "./src/services/otp-cleanup";

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  // Socket.io no mesmo servidor HTTP
  const io = new SocketServer(httpServer, { cors: { origin: "*" } });
  (global as any).__io = io; // exporta io para os Services usarem

  io.on("connection", (socket) => {
    const { role, userId } = socket.handshake.auth;
    socket.join(`${role}:${userId}`);
  });

  // Cron jobs no mesmo processo
  cron.schedule("0 6 * * *", subscriptionCron, { timezone: "America/Sao_Paulo" });
  cron.schedule("*/15 * * * *", otpCleanupCron);

  httpServer.listen(3000, () => console.log("Xua Delivery rodando na porta 3000"));
});
```

> Um processo, um deploy. Next.js + Socket.io + cron jobs. Route Handlers acessam `io` via `global`.

### 3.2 Perfis de Acesso — RBAC

| Perfil | Rotas permitidas | Permissões |
|---|---|---|
| `consumer` | `/catalog`, `/cart`, `/checkout/*`, `/orders/*`, `/subscription/*`, `/profile/*` | Criar/visualizar seus pedidos, endereços, assinaturas. **Selecionar distribuidora no checkout quando há 2+ opções. Configurar preferência de seleção automática via perfil.** Não pode ver dados de outros consumidores. |
| `distributor_admin` | `/distributor/queue`, `/distributor/orders/*`, `/distributor/routes/*`, `/distributor/reconciliation`, `/distributor/kpis`, `/distributor/schedule` | Aceitar/rejeitar pedidos da sua zona, checklist, despacho, conciliação, KPIs da própria operação. **Configurar agenda semanal (ativar/desativar dias, lead_time) e datas bloqueadas.** |
| `operator` | `/driver/deliveries`, `/driver/deliveries/[id]/*`, `/driver/sync` | Executar rota, confirmar OTP, registrar troca de vasilhame, motivo de não-coleta. Opera offline. |
| `support` | `/support/*`, `/ops/otp-override` | Consultar pedidos, ver timeline, reagendar entregas, override de OTP com motivo obrigatório. |
| `ops` | `/ops/*` + `/support/*` | Tudo do support + configurar zonas, dashboard KPIs global (Recharts), exportar auditoria CSV. |

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
| 3 | `CONFIRMED` | system | Gateway aprova → `PAYMENT_CAPTURED`. Se 1ª compra: `DEPOSIT_HELD` (caução retida). |
| 4 | `SENT_TO_DISTRIBUTOR` | system | Socket.io emite `"new_order"` para sala do distribuidor. Evento: `ORDER_RECEIVED_BY_DISTRIBUTOR` |
| 5 | `ACCEPTED_BY_DISTRIBUTOR` | dist_admin | Aceite dentro do SLA. Timer para de contar. Evento: `ORDER_ACCEPTED_BY_DISTRIBUTOR` |
| 6 | `READY_FOR_DISPATCH` | dist_admin | Checklist 100% (itens + vasilhames + endereço). Evento: `DISPATCH_CHECKLIST_COMPLETED` |
| 7 | `OUT_FOR_DELIVERY` | system | OTP HMAC-SHA256 (6 dígitos, 90min, max 5). Web Push ao consumidor. Eventos: `OTP_GENERATED` + `OTP_SENT` + `ORDER_DISPATCHED` |
| 8 | `DELIVERED` | operator | OTP validado. Troca registrada (qty + condição). Eventos: `OTP_VALIDATION_ATTEMPTED` + `ORDER_DELIVERED` + `BOTTLE_EXCHANGE` |
| 9 | (pós) | system | Se `collected_empty_qty ≥ 1` e 1ª compra: caução devolvida. Eventos: `DEPOSIT_REFUND_INITIATED` → `DEPOSIT_REFUNDED` |

### 3.5 Mapa de Eventos de Auditoria (24 tipos)

| Evento | Ator | Quando é emitido |
|---|---|---|
| `ORDER_CREATED` | consumer | Pedido criado com itens e data de entrega. **Payload inclui `distributor_selection_mode: 'manual' | 'auto'`** |
| `ORDER_PRICING_FINALIZED` | system | Valores calculados (items + frete + caução se aplicável) |
| `ORDER_CONFIRMED` | system | Pagamento capturado e janela reservada com sucesso |
| `ORDER_CANCELLED` | consumer/ops | Pedido cancelado com motivo obrigatório |
| `ORDER_RECEIVED_BY_DISTRIBUTOR` | system | Pedido enviado para fila do distribuidor via Socket.io |
| `ORDER_ACCEPTED_BY_DISTRIBUTOR` | dist_user | Aceite dentro do SLA configurado |
| `ORDER_REJECTED_BY_DISTRIBUTOR` | dist_user | Rejeição com motivo obrigatório da lista |
| `DISPATCH_CHECKLIST_COMPLETED` | dist_user | Todos os 3 itens do checklist marcados |
| `ORDER_DISPATCHED` | dist_user | Carga saiu com `route_id` vinculado |
| `OTP_GENERATED` | system | OTP criado ao despachar (apenas hash HMAC armazenado) |
| `OTP_SENT` | system | Web Push ou SMS enviado ao consumidor |
| `OTP_VALIDATION_ATTEMPTED` | driver | Tentativa de validação — sucesso ou falha registrada |
| `ORDER_DELIVERED` | driver/support | OTP válido ou override autorizado |
| `BOTTLE_EXCHANGE_RECORDED` | driver | Coleta de vasilhame (qty + condição ok/danificado/sujo) |
| `EMPTY_NOT_COLLECTED` | driver | Não-coleta com motivo obrigatório |
| `REDELIVERY_REQUIRED` | driver | Falha de entrega com motivo |
| `REDELIVERY_SCHEDULED` | ops/support | Nova data e janela agendadas |
| `PAYMENT_CREATED` | system | Cobrança iniciada no gateway |
| `PAYMENT_CAPTURED` | system | Pagamento aprovado pelo gateway |
| `PAYMENT_FAILED` | system | Pagamento recusado com código de erro |
| `DEPOSIT_HELD` | system | Caução retida na 1ª compra |
| `DEPOSIT_REFUND_INITIATED` | system | Regra A satisfeita — início do reembolso |
| `DEPOSIT_REFUNDED` | system | Reembolso confirmado pelo gateway |
| `DAILY_RECONCILIATION_CLOSED` | dist_user | Conciliação diária fechada (delta + justificativa) |

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

### Semana 4 — Assinatura, Segurança, Testes e Go-Live

| Dev A — Backend / Services | Dev B — Frontend / UI |
|---|---|
| Rate limiting: 100/min global, 30/min orders, 10/min auth/login | Página `/subscription/create`: qty + janela + Calendar próxima data + preview valor |
| Headers segurança em `next.config.ts` (X-Frame-Options, CSP, HSTS) | Página `/subscription/manage`: cards active/paused + botões pausar/retomar/cancelar + Dialog confirmação |
| Validação HMAC assinatura do webhook do gateway | Página `/orders`: histórico paginado + filtro status + "Repetir pedido" que copia carrinho |
| Schemas Zod para todos os 24 event_types do audit | Componente `NpsForm`: 5 estrelas clicáveis + textarea + nota 1–2 abre link suporte |
| Testes de carga: 50 checkouts simultâneos no mesmo slot | Página `/profile`: dados + lista endereços (padrão marcado) + badge caução (retida/devolvida) |
| Dockerfile multi-stage + graceful shutdown `SIGTERM` no `server.ts` | Página `/distributor/reconciliation`: tabela saídas/retornos + delta + textarea justificativa obrigatória |
| Script smoke-test automatizado (verifica health, auth, checkout) | Página `/distributor/kpis`: 3 KpiCards (Recharts) + indicador meta atingida/não + seletor período |
| Seed produção: distribuidor piloto + zona + 30 dias capacidade | Tratamento global: `ErrorBoundary` + mensagens pt-BR + toast reconexão Socket.io |
| Deploy único: `docker compose up` ou `railway up` + README completo | `manifest.json` (PWA) + Service Worker registrado + teste dispositivo real + ícones |

> **Milestone:** Plataforma em produção — pedido real pago, entregue via OTP, KPIs no dashboard, PWA offline

---

## 5. Tecnologias Recomendadas

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
| Banco | PostgreSQL 16 | 21 tabelas, 9 enums, 28 índices, trigger proteção. Schema compatível (2 tabelas de agenda adicionadas). |
| Cache | Redis 7 + ioredis | JWT blacklist, cache catálogo 5min, OTP TTL 90min |
| Real-time | Socket.io 4.x (embutido) | Mesmo processo Next.js. Salas por usuário. Reconnect automático. |
| Cron | node-cron 3.x | Mesmo processo: assinaturas 06h, OTP cleanup 15min. Sem worker extra. |
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
| Caução liberada sem vasilhame | Médio | Regra A só no `DepositService` backend. Frontend **NUNCA** aciona liberação. |
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

*Xuá Delivery — Guia Técnico v3.0 (Next.js Fullstack Unificado)*
*Zanart · Março 2026 · 1 projeto, 1 deploy, 1 servidor*
*21 tabelas · 9 enums · 28 índices · 13 estados · 24 eventos · 5 perfis RBAC*
