# 02 — Tech Stack: Tecnologias, Arquitetura e Regras

> **Árvore de Contexto — Tronco.** Consolidado da documentação em `docs/doc_sistema/`. Última consolidação: 06/07/2026.

---

## 1. Stack tecnológica

| Categoria | Tecnologia | Notas |
|---|---|---|
| Runtime | Node.js 20+ (recomendado 22 LTS) | ESM nativo |
| Linguagem | TypeScript 5.x strict | Tipagem end-to-end |
| Monorepo | npm workspaces | `apps/api` + `apps/web` + `packages/shared` |
| Backend | Express 5 (porta 4000) | Monólito modular, REST |
| Frontend | Next.js 16.2 App Router + React 19 (porta 3001) | Cliente puro da API — sem Server Actions/Route Handlers de negócio |
| ORM / Banco | Prisma 7.x (`@prisma/adapter-pg`) + PostgreSQL 16 | 36 tabelas, 20 enums; schema em `prisma/schema.prisma` (raiz) |
| Cache / Filas | Redis 7 (ioredis 5) + BullMQ 5.x | JWT blacklist, filas assíncronas |
| Real-time | Socket.io 4.x | Acoplado ao servidor HTTP da API (porta 4000) |
| Autenticação | JWT (`jose`) + bcryptjs | Cookie httpOnly `xua-token`, TTL 24h |
| Validação | Zod 4 + React Hook Form | Schemas compartilhados em `packages/shared` |
| Estado (client) | Zustand 5 (persist) + TanStack Query 5 | Cart, checkout, subscription wizard / cache de API |
| UI | Tailwind CSS 4 + shadcn/ui + Radix UI + Lucide | Mobile-first |
| Gráficos | Recharts | KPI dashboards |
| E-mail | Resend 4.8 | Redefinição de senha, notificações transacionais |
| Push | Web Push API + Service Worker | Fallback quando a página não está aberta |
| Offline | PWA (Workbox) + IndexedDB (idb) | Fila offline do motorista com sync automático |
| Pagamentos | Mercado Pago (adapter concreto) | Pix, cartão e dinheiro (`cash_change_for_cents`); provider `mock` só para dev |
| Logs | Pino 10 | Structured logging, correlação por `order_id` |
| Testes | Vitest 4 (+ Supertest) | Unitários e integração |

---

## 2. Arquitetura

### 2.1 Topologia

```
Navegador (4 personas via route-groups do mesmo PWA)
   React Client Components + TanStack Query + Zustand
        ↓ fetch (credentials: include) / socket.io-client
┌────────────────────────┐     ┌──────────────────────────┐
│ apps/web  Next.js :3001│────>│ apps/api  Express :4000  │
│ proxy.ts (RBAC JWT)    │     │ REST + Socket.IO         │
└────────────────────────┘     └────────────┬─────────────┘
                                            │ Prisma 7 (adapter-pg)
        ┌─────────────────┬─────────────────┼──────────────────┐
        │ PostgreSQL 16   │ Redis 7         │ Mercado Pago     │
        │ 36 tabelas      │ JWT blacklist   │ webhooks         │
        │ 20 enums        │ BullMQ queues   │ idempotentes,    │
        │ triggers        │                 │ conta/distribuid.│
        └─────────────────┴─────────────────┴──────────────────┘
+ Worker separado (apps/api/src/worker) — filas BullMQ
```

- **Regra de ouro:** nenhuma lógica de negócio no frontend. Toda lógica, validação (Zod) e autorização vivem no `apps/api`.
- **Worker assíncrono** (`apps/api/src/worker/index.ts`) com 3 filas BullMQ:
  - `internal-jobs` — `otp-cleanup`, `subscription-generation`, `subscription-expiry`
  - `payment-webhooks` — processamento idempotente de webhooks
  - `payments` — `expire-payment` (expiração de cobranças pendentes)
- **Jobs recorrentes:** sem node-cron no processo. Um scheduler externo faz HTTP POST em `/api/internal/jobs/*`, protegido por `INTERNAL_JOB_SECRET` (não JWT). Cada endpoint enfileira no BullMQ ou executa síncrono como fallback.

### 2.2 Camadas do backend

Padrão por módulo: **`routes → controllers → services → repository`**.

| Camada | Responsabilidade |
|---|---|
| Routes (Express Router) | HTTP, verificação JWT/RBAC (`requireRole(...)`), validação Zod, delega ao service |
| Middleware | `authMiddleware` (jwtVerify + blacklist Redis), RBAC, rate limiting por escopo |
| Services | TODA a lógica de negócio: máquina de estados, OTP HMAC, caução, KPIs, assinaturas, `emitEvent()` |
| Repositories | Prisma Client, transações interativas |
| Socket.IO | Auth JWT no handshake; salas `${role}:${userId}` e `distributor:${distributorId}` |

**Módulos da API (16):** `auth, orders, driver, consumers, products, categories, payments, zones, ops, notifications, distributor, distributors (público), banners, subscription-plans, user-subscriptions` + jobs internos.

### 2.3 Estrutura de pastas

```
xua-delivery/
├── prisma/schema.prisma + migrations/
├── apps/api/src/
│   ├── modules/<dominio>/{routes,controllers,services,repository}/
│   ├── jobs/            # subscription-job, subscription-expiry-job, otp-cleanup-job
│   ├── middleware/      # auth, rbac, rate-limit
│   ├── infra/           # auth (jwt, password, blacklist), mail (Resend), queue, prisma, socket
│   ├── http/routes.ts   # registro central de rotas
│   ├── worker/index.ts  # processo BullMQ
│   └── server/index.ts  # entrypoint HTTP + Socket.io
├── apps/web/app/
│   ├── (auth)/ (consumer)/ (distributor)/ (driver)/ (ops)/   # route-groups por persona
│   └── proxy.ts         # JWT cookie + RBAC + redirect por role
└── packages/shared/     # Zod schemas, enums, types compartilhados
```

### 2.4 Padrões críticos de código

- **`emitEvent()` atômico:** mutação de estado + evento de auditoria na **mesma transação Prisma**; Socket.io só emite **após o commit** (rollback ⇒ nenhuma notificação falsa).
- **Snapshot imutável:** itens do pedido copiam `product_name`, `unit_price_cents`, `quantity`; o timeslot escolhido vira snapshot no pedido.
- **Idempotência:** webhooks dedupados por `UNIQUE(provider, provider_event_ref)` (`INSERT ON CONFLICT DO NOTHING`) + `20_cfg_idempotency_keys`; eventos offline do motorista levam UUID v4 gerado no browser, servidor valida unicidade.
- **Segredos nunca em claro no banco:** OTP e tokens de reset guardam apenas hash HMAC-SHA256; credenciais Mercado Pago das distribuidoras criptografadas com AES-256-GCM.
- **Trigger de proteção:** `trg_09_trn_orders_status_regression` bloqueia transições a partir de `DELIVERED`/`CANCELLED` em nível de banco.

### 2.5 Convenções de nomenclatura

- **Tabelas:** `<numero>_<tipo>_<nome>` — tipos: `mst` (master), `cfg` (config), `trn` (transacional), `piv` (pivot N:N), `sec` (segurança), `aud` (auditoria append-only), `log` (histórico event-sourcing). Numeração `01`–`38` (sem `11` e `12`).
- **Chaves:** UUID v4 em todas as PKs/FKs; timestamps em UTC (`timestamptz`).
- **Dinheiro:** sempre centavos `Int` (`price_cents`, `total_cents`, `amount_cents`) — nunca decimal.
- **Enums de auditoria:** snake_case em maiúsculas (`ORDER_CREATED`, ...).
- **Texto de UI:** "garrafão vazio" no app do consumidor; "vasilhame" apenas no backoffice.

---

## 3. Autenticação e segurança

- **Login:** `POST /api/auth/login` → JWT (payload `sub` + `role`, TTL 24h) em cookie httpOnly `xua-token`. Redirect por role no `proxy.ts` do Next.
- **Logout:** blacklist do `jti` no Redis (TTL 24h).
- **Esqueci minha senha:** `POST /api/auth/forgot-password` (rate limit 5/min por IP; resposta neutra contra enumeração) → token 32 bytes, hash HMAC-SHA256 persistido, TTL 30 min, uso único → e-mail assíncrono via Resend → `POST /api/auth/reset-password` valida em transação atômica e invalida JWTs antigos (`markPasswordChanged`).
- **OTP de entrega:** HMAC-SHA256 (`OTP_SECRET`), 6 dígitos, TTL 90 min, máx 5 tentativas → status `locked` (só override ops/support com motivo).
- **Rate limits:** 100/min global (orders), 10/min pagamentos, 5/min password reset por IP.
- **Headers de segurança:** X-Frame-Options, CSP, HSTS.
- **Variáveis de ambiente sensíveis:** `JWT_SECRET`, `PASSWORD_RESET_SECRET`, `OTP_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET`.

---

## 4. Tratamento de erros e resiliência

- **Validação de agendamento:** HTTP **422** com códigos `WEEKDAY_INACTIVE`, `DATE_BLOCKED`, `LEAD_TIME_VIOLATION`.
- **Webhooks:** validação de assinatura HMAC (tolerância configurável via `MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS`), retry via BullMQ, dedup por chave única.
- **Pagamentos não confirmados:** expiram automaticamente (`PAYMENT_EXPIRED`) via fila `payments`.
- **Assinaturas:** geração de pedido com retry + recrédito; após 3 tentativas a data vira `FAILED` e o consumidor é notificado.
- **Offline (motorista):** eventos enfileirados em IndexedDB com UUID; sync idempotente ao reconectar, com banner de progresso e retry em falhas parciais.
- **Erros de UI:** mensagens sempre acionáveis ("editar endereço", "tentar outro pagamento").

---

## 5. Deploy e infraestrutura

- **Deploy:** Railway (API + Web separados) ou Docker Compose local. Dockerfile multi-stage com graceful shutdown em `SIGTERM`.
- **Scheduler externo:** Railway Cron ou Render Cron Job dispara os jobs internos via HTTP. [A DEFINIR: provedor definitivo do cron em produção — a documentação cita ambos]
- **Banco/Redis:** PostgreSQL 16 e Redis 7 gerenciados (Docker Compose no local).
- **Segredos:** cofre centralizado (Doppler ou env vars); nunca `.env` no git.
- **Escala:** Socket.io no mesmo processo da API é suficiente para o MVP; pós-MVP, extrair para serviço dedicado se necessário.
- [A DEFINIR: pipeline de CI/CD, ambientes (staging/prod), estratégia de migrations em produção — não documentados]

---

## 6. Observabilidade

- Logs estruturados (Pino) com correlação por `order_id`, `distributor_id`, `zone_id`, `subscription_id`.
- Métricas-alvo: latência p95 em endpoints críticos, taxa de falha de pagamento, falha de geração de OTP, conversão carrinho → pagamento aprovado.
- Alertas: pedidos pendentes de aceite perto do timeout de SLA; backlog de entregas na janela crítica.
- KPIs calculados exclusivamente via SQL sobre `18_aud_audit_events` (`KpiService` — nunca consulta `09_trn_orders` para métricas).
- [A DEFINIR: ferramenta de APM/monitoramento e destino dos logs em produção]
