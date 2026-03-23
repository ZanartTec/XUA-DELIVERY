# Xuá Delivery — Plano de Implementação Completo

> Análise completa do código-fonte vs documentação + roadmap de execução.

---

## 1. Resumo Executivo

O projeto Xuá Delivery (Next.js 15 fullstack) está **~65% implementado** em termos de funcionalidade end-to-end. A infraestrutura backend (schema, services, repositories, API routes, auth, RBAC) está sólida. As 37 páginas frontend existem com implementação real. Porém, existem **lacunas críticas** que impedem o sistema de funcionar como documentado:

- **Sem real-time no frontend** (socket.io-client ausente)
- **Sem gateway de pagamento** (PaymentService não existe)
- **Sem notificações push** (NotificationService não existe)
- **Sem offline/PWA** (Service Worker, Workbox, IndexedDB ausentes)
- **OTP não gerado no dispatch** (integração faltante)
- **JWT blacklist não implementada** (logout inseguro)
- **Dependências chave ausentes** (TanStack Query, React Hook Form, Recharts, etc.)

---

## 2. Contexto Técnico

| Item | Valor |
|---|---|
| **Framework** | Next.js 16.2.0 (App Router) + custom server.ts |
| **Runtime** | Node.js (TypeScript 5.x strict) |
| **Banco** | PostgreSQL 16 via Prisma 7.5 (19 tabelas, 9 enums) |
| **Cache** | Redis 7 via ioredis 5.10 |
| **Real-time** | Socket.io 4.8 (server-side apenas) |
| **Auth** | JWT (jose 6.2) + bcryptjs 3.0, httpOnly cookies |
| **State** | Zustand 5.0 (auth + cart) |
| **Validação** | Zod 4.3 (server-side schemas) |
| **UI** | shadcn/ui + Tailwind CSS 4 |
| **Cron** | node-cron 4.2 (subscriptions 06h + OTP cleanup 15min) |
| **Deploy target** | Docker Compose (PostgreSQL + Redis) |

---

## 3. Estado Atual — Inventário Completo

### 3.1 Backend — Services (6/10 necessários)

| Service | Arquivo | Status | Notas |
|---|---|---|---|
| OrderService | `src/services/order-service.ts` | ✅ Implementado | State machine com 8 transições. Faltam estados intermediários (PAYMENT_PENDING, CONFIRMED, SENT_TO_DISTRIBUTOR) |
| OtpService | `src/services/otp-service.ts` | ✅ Implementado | HMAC-SHA256, max 5 tentativas, TTL 90min, override |
| CapacityService | `src/services/capacity-service.ts` | ✅ Implementado | SELECT FOR UPDATE anti-overbooking |
| DepositService | `src/services/deposit-service.ts` | ✅ Implementado | Regra A: release quando DELIVERED + collected ≥ 1 |
| KpiService | `src/services/kpi-service.ts` | ✅ Implementado | CTE SQL via audit_events (3 KPIs) |
| SubscriptionCron | `src/services/subscription-cron.ts` | ✅ Implementado | Batch 50, date overflow fix |
| OtpCleanup | `src/services/otp-cleanup.ts` | ✅ Implementado | Expira OTPs antigos |
| PaymentService | — | ❌ **Ausente** | IPaymentGateway interface + charge() + confirm() |
| NotificationService | — | ❌ **Ausente** | Web Push API + push token management |
| SubscriptionService | — | ❌ **Ausente** | CRUD (pause/resume/cancel) — cron existe mas não CRUD |

### 3.2 Backend — Repositories (5/5)

| Repository | Status |
|---|---|
| order-repository | ✅ |
| audit-repository | ✅ |
| otp-repository | ✅ |
| capacity-repository | ✅ |
| consumer-repository | ✅ |

### 3.3 Backend — API Routes (17/25 necessárias)

| Rota | Método | Status |
|---|---|---|
| `/api/auth/login` | POST | ✅ |
| `/api/auth/register` | POST | ✅ |
| `/api/auth/logout` | POST | ⚠️ Parcial (sem Redis blacklist) |
| `/api/orders` | GET/POST | ✅ |
| `/api/orders/[id]` | GET/PATCH | ✅ (8 ações) |
| `/api/orders/[id]/rating` | POST | ✅ |
| `/api/orders/[id]/bottle-exchange` | POST | ✅ |
| `/api/orders/[id]/empty-not-collected` | POST | ✅ |
| `/api/payments/webhook` | POST | ✅ (HMAC, idempotent) |
| `/api/subscriptions` | GET/POST | ✅ |
| `/api/reconciliations` | GET/POST | ✅ |
| `/api/driver/deliveries` | GET | ✅ |
| `/api/consumers/[id]/addresses` | GET/POST | ✅ |
| `/api/zones/[id]/capacity` | GET | ✅ |
| `/api/orders/[id]/reschedule` | PATCH | ❌ |
| `/api/consumers/[id]` | PATCH | ❌ |
| `/api/subscriptions/[id]` | PATCH | ❌ |
| `/api/zones` | GET/POST | ❌ |
| `/api/zones/[id]` | PATCH/DELETE | ❌ |
| `/api/zones/[id]/coverage` | POST/DELETE | ❌ |
| `/api/audit/export` | GET | ❌ |
| `/api/notifications/subscribe` | POST | ❌ |

### 3.4 Frontend — Pages (37/37 existem, com gaps funcionais)

| Superfície | Páginas | Layout | Status |
|---|---|---|---|
| Auth | login, register | (auth) | ✅ Funcional |
| Consumer | 12 páginas | (consumer) | ⚠️ Existem, sem real-time |
| Distributor | 6 páginas | (distributor) | ⚠️ Existem, KPIs placeholder |
| Driver | 4 páginas | (driver) | ⚠️ Existem, sem offline/PWA |
| Ops | 6 páginas | (ops) | ⚠️ Existem, KPIs placeholder |

### 3.5 Infraestrutura

| Item | Status | Notas |
|---|---|---|
| Prisma schema (19 modelos) | ✅ | Completo |
| Migration SQL | ✅ | 1 migration init |
| Seed | ✅ | Produto, distribuidor, zona, 5 users, 7 dias capacidade |
| Docker Compose | ✅ | PostgreSQL 16 + Redis 7 |
| server.ts (custom) | ✅ | Socket.io + cron + graceful shutdown |
| middleware.ts (RBAC) | ✅ | JWT + role-based routing pages + API |
| Shared components | ✅ | 5 componentes (offline-banner, timeline, otp-input, sla-countdown, status-pill) |
| UI components | ⚠️ Parcial | Apenas button, card, input (shadcn/ui) |
| Security audit | ✅ | 22 vulnerabilidades encontradas e corrigidas |

### 3.6 Dependências

| Pacote | Documentado | Instalado |
|---|---|---|
| next, react, react-dom | ✅ | ✅ |
| prisma, @prisma/client | ✅ | ✅ |
| socket.io (server) | ✅ | ✅ |
| ioredis | ✅ | ✅ |
| jose, bcryptjs | ✅ | ✅ |
| zod | ✅ | ✅ |
| zustand | ✅ | ✅ |
| node-cron | ✅ | ✅ |
| tailwindcss, clsx, tailwind-merge | ✅ | ✅ |
| class-variance-authority | ✅ | ✅ |
| @tanstack/react-query | ✅ | ❌ |
| react-hook-form + @hookform/resolvers | ✅ | ❌ |
| recharts | ✅ | ❌ |
| socket.io-client | ✅ | ❌ |
| lucide-react | ✅ | ❌ |
| web-push | ✅ | ❌ |
| idb (IndexedDB) | ✅ | ❌ |
| workbox-* | ✅ | ❌ |
| pino | ✅ | ❌ |
| vitest + supertest | ✅ | ❌ |

---

## 4. Gap Analysis — Feature por Feature

### ✅ Implementado (funcional end-to-end)

| Feature | Componentes |
|---|---|
| Auth (register + login + RBAC middleware) | auth routes, middleware.ts, lib/auth.ts |
| Criação de pedido (com anti-overbooking) | OrderService.createOrder, capacityService.reserve, orders route |
| Aceitar/rejeitar pedido | OrderService.accept/reject + PATCH route |
| Checklist + despacho | OrderService.completeChecklist/dispatch |
| Confirmar entrega | OrderService.deliverOrder |
| Cancelar pedido | OrderService.cancelOrder |
| OTP (gerar/validar/override) | OtpService (3 métodos) |
| Caução (reter/devolver) | DepositService (Regra A) |
| Bottle exchange | POST /api/orders/[id]/bottle-exchange |
| Non-collection | POST /api/orders/[id]/empty-not-collected |
| Rating NPS | POST /api/orders/[id]/rating |
| Webhook pagamento (idempotente) | POST /api/payments/webhook (HMAC) |
| Reconciliação diária | GET/POST /api/reconciliations |
| KPI service (3 métricas) | KpiService via CTE SQL |
| Subscription cron (auto-gerar pedidos) | subscription-cron.ts (batch 50, 06h SP) |
| OTP cleanup (expirar antigos) | otp-cleanup.ts (cada 15min) |
| Seed data | prisma/seed.ts |
| Docker Compose | docker-compose.yml |
| 37 páginas frontend | Todos os layouts + pages |
| Shared components (5) | offline-banner, timeline, otp-input, sla-countdown, status-pill |

### ⚠️ Parcialmente Implementado

| Feature | O que existe | O que falta |
|---|---|---|
| **State machine** | 8 transições CREATED→...→DELIVERED | Estados intermediários: PAYMENT_PENDING → CONFIRMED → SENT_TO_DISTRIBUTOR |
| **Socket.io server** | Emissão pós-commit em 4 métodos do OrderService | Eventos `new_order` e `sla_warning` não implementados |
| **Logout** | Limpa cookie httpOnly | Redis blacklist do token |
| **Subscription** | Cron gera pedidos + GET/POST route | CRUD (pause/resume/cancel) |
| **KPI pages** | Fetch dados do KpiService | Gráficos Recharts são placeholder |
| **Offline banner** | Detecta offline + lê queue do localStorage | Sem IndexedDB real, sem sync |
| **shadcn/ui** | 3 componentes (button, card, input) | Dialog, Select, Tabs, Calendar, Badge, Progress, etc. |

### ❌ Ausente (não implementado)

| Feature | Impacto | Bloqueio |
|---|---|---|
| **socket.io-client + useSocket hook** | zero real-time no browser | Bloqueia: tracking pedido, fila distribuidor, SLA countdown real |
| **PaymentService + IPaymentGateway** | sem pagamento real | Bloqueia: checkout funcional, estados payment_pending→confirmed |
| **NotificationService (Web Push)** | sem notificações | Bloqueia: OTP via push, status updates para consumer |
| **Service Worker + PWA (Workbox + idb)** | sem offline | Bloqueia: operação offline motorista |
| **TanStack Query** | sem cache/revalidação | Impacta: performance, optimistic updates |
| **React Hook Form** | sem validação client-side | Impacta: UX de formulários |
| **Recharts** | sem gráficos KPI | Bloqueia: dashboards distribuidor e ops |
| **Trigger SQL status_regression** | sem proteção banco | Risco: regressão via SQL direto |
| **Rate limiting** | sem proteção brute-force | Risco: segurança |
| **OTP no dispatch** | OTP não gerado automaticamente | Bloqueia: fluxo entrega OTP |
| **Fetch wrapper (api-client)** | sem interceptor JWT | Impacta: renovação automática de token |
| **Zone CRUD (ops)** | sem gestão de zonas | Bloqueia: configuração operacional |
| **Audit CSV export** | sem exportação | Bloqueia: compliance/auditoria |
| **Profile edit** | sem editar nome/email/phone | Impacta: UX consumer |
| **Reschedule endpoint** | sem reagendar entrega | Bloqueia: fluxo suporte |
| **Testes automatizados (Vitest)** | zero testes | Risco: regressão |
| **Structured logging (Pino)** | sem logs estruturados | Risco: debugging produção |

---

## 5. Fases de Implementação

### Fase 1 — Fundação Client-Side (Prioridade: 🔴 CRÍTICA)

**Objetivo:** Instalar dependências faltantes e criar infraestrutura frontend necessária.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 1.1 | Instalar deps: `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `socket.io-client`, `recharts`, `lucide-react` | Nenhuma | package.json atualizado |
| 1.2 | Criar `QueryClientProvider` wrapper em layout raiz | 1.1 | `app/providers.tsx` |
| 1.3 | Criar hook `useSocket` (conecta ao server, join room, reconexão automática) | 1.1 | `src/hooks/use-socket.ts` |
| 1.4 | Criar fetch wrapper `src/lib/api-client.ts` (interceptor JWT, error handling) | Nenhuma | Fetch centralizado |
| 1.5 | Instalar shadcn/ui components faltantes: Dialog, Select, Tabs, Calendar, Badge, Progress, Separator, DropdownMenu | 1.1 | `src/components/ui/*.tsx` |
| 1.6 | Integrar `useSocket` nas páginas que precisam de real-time: `/orders/[id]`, `/distributor/queue`, `/driver/deliveries` | 1.3 | Real-time funcional |
| 1.7 | Migrar forms existentes para React Hook Form + Zod | 1.1 | Validação client-side |

### Fase 2 — Segurança & State Machine (Prioridade: 🔴 CRÍTICA)

**Objetivo:** Corrigir gaps de segurança e completar o fluxo do pedido.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 2.1 | Implementar JWT blacklist via Redis no logout | Nenhuma | `src/lib/jwt-blacklist.ts` + middleware check |
| 2.2 | Criar trigger SQL `trg_09_trn_orders_status_regression` | Nenhuma | Nova migration Prisma |
| 2.3 | Adicionar estados intermediários na state machine: PAYMENT_PENDING, CONFIRMED, SENT_TO_DISTRIBUTOR | Nenhuma | Atualizar VALID_TRANSITIONS |
| 2.4 | Implementar `orderService.sendToDistributor()` — emite Socket.io `new_order` | 2.3 | Fluxo completo |
| 2.5 | Integrar `otpService.generate()` dentro de `orderService.dispatch()` | Nenhuma | OTP gerado automaticamente |
| 2.6 | Implementar rate limiting (100/min global, 30/min orders, 10/min auth) | Nenhuma | Middleware rate limit |

### Fase 3 — Payment Gateway (Prioridade: 🔴 ALTA)

**Objetivo:** Integrar pagamento real com interface desacoplada.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 3.1 | Criar interface `IPaymentGateway` + tipo `PaymentResult` | Nenhuma | `src/services/payment-gateway.ts` |
| 3.2 | Implementar adapter concreto (Pix/Stripe/outro) | 3.1 | `src/services/adapters/pix-adapter.ts` |
| 3.3 | Criar `PaymentService.charge()` + `PaymentService.refund()` | 3.1 | `src/services/payment-service.ts` |
| 3.4 | Conectar `createOrder() → sendToPayment() → webhook confirms` | 3.3, 2.3 | Fluxo CREATED → PAYMENT_PENDING → CONFIRMED |
| 3.5 | Integrar deposit (caução) no fluxo de cobrança da 1ª compra | 3.3 | DepositService.hold no charge |
| 3.6 | Implementar reembolso automático no cancelamento | 3.3 | PaymentService.refund integrado |

### Fase 4 — Rotas e Services Faltantes (Prioridade: 🟡 MÉDIA)

**Objetivo:** Completar endpoints documentados mas não implementados.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 4.1 | Criar `SubscriptionService` (pause, resume, cancel) | Nenhuma | `src/services/subscription-service.ts` |
| 4.2 | Criar route `PATCH /api/subscriptions/[id]` | 4.1 | Gestão assinatura |
| 4.3 | Criar route `PATCH /api/orders/[id]/reschedule` | Nenhuma | Reagendamento suporte |
| 4.4 | Criar route `PATCH /api/consumers/[id]` | Nenhuma | Editar perfil |
| 4.5 | Criar routes `GET/POST /api/zones`, `PATCH/DELETE /api/zones/[id]` | Nenhuma | CRUD zonas ops |
| 4.6 | Criar route `POST /api/zones/[id]/coverage` | 4.5 | Gestão cobertura |
| 4.7 | Criar route `GET /api/audit/export` (CSV stream) | Nenhuma | Exportação auditoria |
| 4.8 | Criar `rescheduleSchema`, `subscriptionUpdateSchema`, `profileUpdateSchema`, `zoneSchema` | Nenhuma | Schemas Zod |

### Fase 5 — Recharts & KPIs (Prioridade: 🟡 MÉDIA)

**Objetivo:** Substituir placeholders por gráficos reais.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 5.1 | Criar componente `KpiChart` (LineChart + meta indicator) | 1.1 (recharts) | `src/components/shared/kpi-chart.tsx` |
| 5.2 | Implementar período seletor (7d/30d/90d) com refetch | 5.1 | Componente reutilizável |
| 5.3 | Atualizar `/distributor/kpis` com gráficos reais | 5.1 | Dashboard funcional |
| 5.4 | Atualizar `/ops/kpis` com visão multi-distribuidor | 5.1 | Dashboard ops funcional |

### Fase 6 — Notificações Web Push (Prioridade: 🟡 MÉDIA)

**Objetivo:** Implementar sistema de notificações nativas do navegador.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 6.1 | Instalar `web-push`, gerar VAPID keys | Nenhuma | Configuração push |
| 6.2 | Criar `NotificationService` (subscribe, send, sendBatch) | 6.1 | `src/services/notification-service.ts` |
| 6.3 | Criar route `POST /api/notifications/subscribe` | 6.2 | Endpoint registro token |
| 6.4 | Criar hook `usePushSubscription` (solicita permissão + registra) | 6.3 | `src/hooks/use-push.ts` |
| 6.5 | Integrar push nos Services: dispatch (OTP), delivery, deposit refund | 6.2 | Notificações em status críticos |

### Fase 7 — PWA & Offline (Prioridade: 🟡 MÉDIA)

**Objetivo:** Motorista opera offline com sync automático.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 7.1 | Instalar `idb`, `workbox-precaching`, `workbox-strategies` | Nenhuma | Deps offline |
| 7.2 | Criar Service Worker com Workbox (cache assets + API responses) | 7.1 | `public/sw.js` |
| 7.3 | Criar `manifest.json` (PWA metadata, ícones) | Nenhuma | `public/manifest.json` |
| 7.4 | Criar `src/lib/offline-queue.ts` (IndexedDB queue com UUID v4) | 7.1 | Fila offline |
| 7.5 | Criar hook `useOfflineSync` (detectar reconexão, processar fila, progress) | 7.4 | Sync automático |
| 7.6 | Integrar offline queue no fluxo do motorista (OTP, exchange, non-collection) | 7.4, 7.5 | Driver opera offline |
| 7.7 | Atualizar `OfflineBanner` para ler da fila IndexedDB real (não localStorage) | 7.4 | Banner acurado |

### Fase 8 — Testes & Observabilidade (Prioridade: 🟢 DESEJÁVEL)

**Objetivo:** Garantir qualidade e operabilidade em produção.

| # | Task | Dependência | Entregável |
|---|---|---|---|
| 8.1 | Instalar `vitest`, `supertest`, configurar Vitest | Nenhuma | vitest.config.ts |
| 8.2 | Testes unitários: OrderService state machine (todas as transições) | 8.1 | 15+ testes |
| 8.3 | Testes unitários: OtpService (generate, validate, lock, override) | 8.1 | 8+ testes |
| 8.4 | Testes unitários: CapacityService (reserve, concurrent, slot full) | 8.1 | 5+ testes |
| 8.5 | Testes de integração: fluxo completo pedido → entrega | 8.1 | E2E backend |
| 8.6 | Testes de concorrência: 10 checkouts simultâneos no mesmo slot | 8.1 | Anti-overbooking validado |
| 8.7 | Instalar `pino` + configurar structured logging com correlation ID | Nenhuma | Logs JSON |
| 8.8 | Seed: expandir para 30 dias de capacidade (docs pede 30, seed gera 7) | Nenhuma | prisma/seed.ts atualizado |

---

## 6. Task Breakdown — Prioridade e Esforço

| Task | Fase | Prioridade | Esforço | Bloqueado por |
|---|---|---|---|---|
| Instalar dependências faltantes | F1 | 🔴 Crítica | P | — |
| QueryClientProvider | F1 | 🔴 Crítica | P | F1.1 |
| Hook useSocket | F1 | 🔴 Crítica | M | F1.1 |
| API client fetch wrapper | F1 | 🔴 Crítica | P | — |
| shadcn/ui components | F1 | 🟡 Média | M | F1.1 |
| Integrar real-time nas pages | F1 | 🔴 Crítica | M | F1.3 |
| Migrar para React Hook Form | F1 | 🟡 Média | G | F1.1 |
| JWT blacklist Redis | F2 | 🔴 Crítica | P | — |
| Trigger SQL proteção | F2 | 🔴 Crítica | P | — |
| State machine estados intermediários | F2 | 🔴 Alta | M | — |
| sendToDistributor() | F2 | 🔴 Alta | M | F2.3 |
| OTP no dispatch | F2 | 🔴 Alta | P | — |
| Rate limiting | F2 | 🟡 Média | M | — |
| IPaymentGateway interface | F3 | 🔴 Alta | M | — |
| PaymentService | F3 | 🔴 Alta | G | F3.1 |
| Fluxo pagamento completo | F3 | 🔴 Alta | G | F3.3, F2.3 |
| SubscriptionService CRUD | F4 | 🟡 Média | M | — |
| Route reschedule | F4 | 🟡 Média | P | — |
| Route profile edit | F4 | 🟡 Média | P | — |
| Zone CRUD routes | F4 | 🟡 Média | M | — |
| Audit CSV export | F4 | 🟡 Média | M | — |
| KpiChart component | F5 | 🟡 Média | M | F1.1 (recharts) |
| KPI dashboards reais | F5 | 🟡 Média | M | F5.1 |
| NotificationService | F6 | 🟡 Média | G | — |
| Web Push integration | F6 | 🟡 Média | M | F6.2 |
| Service Worker + PWA | F7 | 🟡 Média | G | — |
| Offline queue IndexedDB | F7 | 🟡 Média | G | F7.1 |
| useOfflineSync hook | F7 | 🟡 Média | M | F7.4 |
| Vitest setup + testes | F8 | 🟢 Desejável | G | — |
| Pino structured logging | F8 | 🟢 Desejável | P | — |

> Esforço: **P** = Pequeno (< 2h), **M** = Médio (2-8h), **G** = Grande (> 8h)

---

## 7. Dependências entre Módulos

```
Fase 1 (Deps + Client infra)
    │
    ├──► Fase 2 (Segurança + State Machine)
    │        │
    │        └──► Fase 3 (Payment Gateway)
    │                │
    │                └──► Fase 4 (Routes faltantes) ──► Fase 8 (Testes)
    │
    ├──► Fase 5 (Recharts KPIs) [independente]
    │
    ├──► Fase 6 (Web Push) [independente]
    │
    └──► Fase 7 (PWA/Offline) [independente]
```

**Paralelismo possível:**
- F5 (KPIs), F6 (Push), F7 (PWA) podem ser desenvolvidas em paralelo entre si
- F1 é pré-requisito para todas as demais
- F2 é pré-requisito para F3 (state machine completa antes do payment flow)
- F3 é pré-requisito para F4 (routes dependem do payment flow existir)

---

## 8. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | Gateway pagamento demora aprovação sandbox | Alta | Alto | Iniciar integração com mock adapter. Trocar para real quando aprovado. |
| 2 | Socket.io-client + Next.js 16 incompatibilidade | Média | Alto | Testar com `dynamic(() => import(...), { ssr: false })`. Fallback: polling. |
| 3 | Workbox + Next.js custom server conflito | Média | Médio | Gerar SW manualmente (sem next-pwa). Usar workbox-build no build step. |
| 4 | React Hook Form migração quebra forms existentes | Média | Médio | Migrar um form por vez. Manter backwards compatibility. |
| 5 | Testes de concorrência expõem race conditions | Alta | Alto | Já mitigado com SELECT FOR UPDATE. Validar com Vitest + pool real PostgreSQL. |
| 6 | Web Push permission denied pelo usuário | Alta | Baixo | Fallback graceful: banner in-app + SMS futuro. |
| 7 | IndexedDB quota exceeded no motorista | Baixa | Médio | Limpar queue após sync. Limit de 100 eventos enfileirados. |
| 8 | Next.js 16 breaking changes com TanStack Query | Média | Médio | Verificar compatibilidade. TanStack Query 5 suporta RSC via `HydrationBoundary`. |

---

## 9. Considerações de Performance

| Item | Estado Atual | Recomendação |
|---|---|---|
| **Queries KPI** | CTE SQL direto no audit_events | ✅ Bom. Adicionar índice composto `(order_id, event_type, occurred_at)` se lento. |
| **Anti-overbooking** | SELECT FOR UPDATE na transação | ✅ Bom. Sem mudança necessária. |
| **Cache catálogo** | Sem cache | Adicionar Redis cache 5min no GET de produtos/capacidade. |
| **Socket.io rooms** | User-level rooms | ✅ Bom. Adequado para MVP. |
| **Subscription cron** | Batch de 50 | ✅ Bom. Considerar aumentar para 100 se base crescer. |
| **Prisma queries** | Client extension (pg adapter) | ✅ Bom. Connection pooling via PrismaPg. |
| **Bundle size** | Sem análise | Ativar `@next/bundle-analyzer` após instalar Recharts (heaviest dep). |

---

## 10. Considerações de Segurança

| Item | Estado | Ação |
|---|---|---|
| **JWT** | HMAC-SHA256 via jose, httpOnly cookies | ✅ Bom |
| **JWT blacklist** | ❌ Não implementado | 🔴 Implementar F2.1 |
| **RBAC** | ✅ Middleware pages + API routes | ✅ Bom |
| **IDOR protection** | ✅ SEC-05 consumer/driver ownership check | ✅ Bom |
| **Webhook HMAC** | ✅ SEC-04 payment webhook verification | ✅ Bom |
| **OTP hash** | ✅ HMAC-SHA256, nunca texto claro | ✅ Bom |
| **Password hash** | ✅ bcrypt 12 rounds | ✅ Bom |
| **Rate limiting** | ❌ Não implementado | 🟡 Implementar F2.6 |
| **CSRF** | ✅ httpOnly cookie + SameSite=lax | ✅ Bom |
| **SQL injection** | ✅ Prisma ORM (parameterized) | ✅ Bom |
| **XSS** | ✅ React escapa por padrão | ✅ Bom |
| **CSP headers** | ❌ Não configurado em next.config.ts | 🟡 Adicionar headers em next.config.ts |
| **Trigger proteção** | ❌ Ausente na migration | 🔴 Implementar F2.2 |
| **Socket.io auth** | ✅ JWT verification no handshake | ✅ Bom (SEC-01 fix) |

---

## Apêndice: Checklist de Completude

- [x] Full plan generated
- [x] All flows from docs mapped (Fluxo 1-4)
- [x] All missing features identified (seção 4)
- [x] Plan aligned with architecture (services layer, Prisma, RBAC, Socket.io pós-commit)
- [x] No unresolved ambiguities (seção research.md)

```yaml
plan_complete: true

analysis:
  implemented:
    - "Auth (register/login/logout/RBAC middleware)"
    - "OrderService (8 transições state machine)"
    - "OtpService (generate/validate/override HMAC)"
    - "CapacityService (SELECT FOR UPDATE anti-overbooking)"
    - "DepositService (Regra A hold/release)"
    - "KpiService (3 KPIs via CTE audit_events)"
    - "SubscriptionCron (batch 50, 06h São Paulo)"
    - "OtpCleanup (expire 15min)"
    - "5 repositories (order/audit/otp/capacity/consumer)"
    - "17 API routes (auth, orders, payments, subscriptions, etc.)"
    - "37 frontend pages (31 pages + 6 layouts — ALL real implementation)"
    - "5 shared components (offline-banner, timeline, otp-input, sla-countdown, status-pill)"
    - "Prisma schema (19 models, 9 enums)"
    - "Docker Compose (PostgreSQL 16 + Redis 7)"
    - "Seed data (produto, distribuidor, zona, 5 users, 7 dias)"
    - "Security audit (22 vulns found + 22 fixed)"
  partial:
    - "State machine — missing PAYMENT_PENDING/CONFIRMED/SENT_TO_DISTRIBUTOR transitions"
    - "Socket.io — server emits but no client listener (socket.io-client not installed)"
    - "Logout — clears cookie but no Redis JWT blacklist"
    - "Subscription — cron exists but no CRUD (pause/resume/cancel)"
    - "KPI pages — data fetch works but Recharts are placeholders"
    - "OfflineBanner — detects offline but no real IndexedDB queue"
    - "shadcn/ui — only 3 components (button/card/input)"
  missing:
    - "PaymentService + IPaymentGateway (no payment integration)"
    - "NotificationService (Web Push — table exists, no code)"
    - "socket.io-client + useSocket hook (zero frontend real-time)"
    - "TanStack Query (not installed — documented as server state)"
    - "React Hook Form (not installed — documented for forms)"
    - "Recharts (not installed — KPI charts are placeholders)"
    - "Service Worker + PWA (Workbox + IndexedDB offline)"
    - "JWT blacklist via Redis"
    - "OTP generation at dispatch"
    - "Rate limiting"
    - "Trigger SQL status_regression"
    - "8 API routes (reschedule, profile edit, subscription CRUD, zone CRUD, audit export, push subscribe)"
    - "API client fetch wrapper with JWT interceptor"
    - "Structured logging (Pino)"
    - "Automated tests (Vitest + Supertest)"
    - "CSP security headers"
    - "lucide-react icons"

artifacts:
  plan: "docs/plan.md"
  research: "docs/research.md"
  data_model: "docs/data-model.md"
  contracts: "docs/contracts/api-routes.md"
  quickstart: "docs/quickstart.md"

warnings:
  - "R-01: JWT token remains valid 24h after logout (no Redis blacklist)"
  - "R-02: No SQL trigger protecting order status regression"
  - "R-04: No payment gateway integration — orders created without real payment"
  - "R-06: Frontend has zero real-time capability (socket.io-client missing)"
  - "States DRAFT and PICKING defined in enum but never used in code"
  - "Next.js 16.2 may have breaking changes with TanStack Query / Socket.io-client"

errors: []
```
