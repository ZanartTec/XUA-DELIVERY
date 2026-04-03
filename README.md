# Xuá Delivery

Plataforma fullstack de delivery de água mineral em garrafão retornável 20L.

Organizado como **monorepo npm workspaces** com dois apps independentes:
- **`apps/api`** — API REST + Socket.io (Express 5, porta 4000)
- **`apps/web`** — Frontend PWA (Next.js 16.2 App Router, porta 3001)
- **`packages/shared`** — Tipos, enums, schemas e constantes compartilhados

---

## Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|---|---|---|
| **Node.js** | 20 LTS | Recomendado via [nvm](https://github.com/nvm-sh/nvm) |
| **npm** | 10+ | Incluído no Node.js 20 |
| **Docker** | 24+ | Para subir PostgreSQL e Redis localmente |

---

## Instalação

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd xua-delivery/xua-delivery

# 2. Instale as dependências (todos os workspaces)
npm install

# 3. Suba o banco de dados e o Redis
docker compose up -d

# 4. Gere o cliente Prisma e aplique as migrations
npx prisma migrate deploy
```

---

## Variáveis de Ambiente

Cada app possui seu próprio arquivo `.env`. Crie-os a partir dos exemplos:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### `apps/api/.env`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | Não | Porta da API (default: `4000`) |
| `HOSTNAME` | Não | Hostname (default: `0.0.0.0`) |
| `DATABASE_URL` | **Sim** | String de conexão PostgreSQL |
| `REDIS_URL` | **Sim** | String de conexão Redis |
| `JWT_SECRET` | **Sim** | Chave HMAC-SHA256 para JWT (mínimo 32 caracteres) |
| `OTP_SECRET` | **Sim** | Chave HMAC para OTPs de entrega |
| `PAYMENT_WEBHOOK_SECRET` | **Sim** | Segredo HMAC para validar webhooks do gateway |
| `INTERNAL_JOB_SECRET` | **Sim** | Segredo para rotas de jobs internos |
| `ALLOWED_ORIGIN` | Em produção | Origem permitida no CORS (ex: `https://seudominio.com`) |

### `apps/web/.env`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Sim** | URL base da API (ex: `http://localhost:4000`) |
| `NEXT_PUBLIC_WS_URL` | **Sim** | URL do Socket.io (ex: `http://localhost:4000`) |

> **Atenção:** A API falha na inicialização com erro `FATAL:` se qualquer variável obrigatória estiver ausente.

---

## Banco de Dados

O schema é gerenciado via **Prisma Migrate**. O arquivo de schema principal fica em `prisma/schema.prisma` (raiz do monorepo).

**Tabelas criadas:**

```
mst_consumers            — Consumidores
mst_addresses            — Endereços de entrega
mst_distributors         — Distribuidores parceiros
mst_zones                — Zonas de cobertura
mst_zone_coverage        — Bairros/CEPs por zona
mst_products             — Catálogo de produtos
cfg_delivery_capacity    — Slots de capacidade (anti-overbooking)
sec_consumer_push_tokens — Tokens de notificação push
trn_orders               — Pedidos (máquina de estados com 13 estados)
trn_order_items          — Itens do pedido
trn_subscriptions        — Assinaturas mensais
piv_subscription_orders  — Relação assinatura ↔ pedido
trn_payments             — Pagamentos
cfg_payment_webhook_events — Idempotência de webhooks
trn_deposits             — Caução de vasilhame
sec_order_otps           — OTPs de entrega (TTL 90min, max 5 tentativas)
trn_reconciliations      — Conciliação diária de vasilhames
aud_audit_events         — Auditoria append-only (fonte dos KPIs)
```

---

## Como Rodar

### Infraestrutura (PostgreSQL + Redis)

```bash
docker compose up -d
```

### Desenvolvimento

```bash
# Roda API (porta 4000) e Web (porta 3001) simultaneamente
npm run dev

# Ou separadamente:
npm run dev:api
npm run dev:web
```

A API usa `tsx --watch` com hot-reload nativo. O frontend usa `next dev`.

### Produção

```bash
# Build do frontend
npm run build:web

# Inicia API
npm run start:api

# Inicia Web
npm run start:web
```

---

## Scripts Disponíveis (raiz do monorepo)

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia API e Web em paralelo (desenvolvimento) |
| `npm run dev:api` | Inicia apenas a API com hot-reload |
| `npm run dev:web` | Inicia apenas o frontend com hot-reload |
| `npm run build:web` | Gera o build de produção do frontend |
| `npm run start:api` | Inicia a API em produção |
| `npm run start:web` | Inicia o frontend em produção |
| `npm run lint` | ESLint no workspace `@xua/web` |
| `npm run typecheck:api` | Verificação de tipos do `@xua/api` |
| `npm run shared:check` | Verificação de tipos do `@xua/shared` |
| `npm test` | Executa a suíte de testes com Vitest |
| `npm run test:coverage` | Testes com relatório de cobertura |

---

## Estrutura do Projeto

```
xua-delivery/
├── prisma/
│   ├── schema.prisma          # Schema principal do banco de dados
│   ├── seed.ts                # Script de seed
│   └── migrations/            # Histórico de migrations
│
├── apps/
│   ├── api/                   # @xua/api — Express 5 (porta 4000)
│   │   └── src/
│   │       ├── server/        # Entrypoint HTTP + Socket.io + graceful shutdown
│   │       ├── http/          # App Express, registro de rotas
│   │       ├── modules/       # Módulos de negócio (routes → controller → service → repository)
│   │       │   ├── auth/
│   │       │   ├── orders/
│   │       │   ├── driver/
│   │       │   ├── consumers/
│   │       │   ├── subscriptions/
│   │       │   ├── products/
│   │       │   ├── payments/
│   │       │   ├── zones/
│   │       │   ├── ops/
│   │       │   └── notifications/
│   │       ├── infra/         # Clientes externos (Prisma, Redis, Socket.io, logger, CEP)
│   │       ├── jobs/          # Cron jobs (OTP cleanup, subscription renewal)
│   │       ├── middleware/    # Auth JWT, RBAC, rate-limit, error handler
│   │       └── utils/         # Helpers puros (date, pagination, csv, format)
│   │
│   └── web/                   # @xua/web — Next.js 16.2 App Router (porta 3001)
│       └── app/
│           ├── (auth)/        # Rotas públicas: login, cadastro
│           ├── (consumer)/    # Área do consumidor (role: consumer)
│           ├── (distributor)/ # Área do distribuidor (role: distributor_admin, operator)
│           ├── (driver)/      # Módulo motorista (role: driver)
│           └── (ops)/         # Painel de operações (role: ops, support)
│
└── packages/
    └── shared/                # @xua/shared — tipos, enums, schemas, constantes
```

---

## Perfis de Acesso (RBAC)

| Role JWT | Área | Permissões principais |
|---|---|---|
| `consumer` | `(consumer)` | Realizar pedidos, acompanhar status, gerenciar assinatura |
| `distributor_admin` | `(distributor)` | Aceitar/recusar pedidos, despachar, dashboard KPIs |
| `operator` | `(distributor)` | Operações do dia a dia do distribuidor |
| `driver` | `(driver)` | Confirmar entregas via OTP, registrar troca de vasilhame |
| `ops` | `(ops)` | Configurar zonas/capacidade, KPIs globais, override de OTP |
| `support` | `(ops)` | Console de suporte, timeline de eventos, exportar auditoria |

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| API | Express 5 |
| Frontend | Next.js 16.2 (App Router), React 19 |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI |
| Estado cliente | Zustand 5, TanStack Query 5 |
| Formulários | React Hook Form + Zod 4 |
| Banco de dados | PostgreSQL 16 via Prisma 7 |
| Cache / sessões | Redis 7 via ioredis |
| Auth | JWT (jose) + bcryptjs |
| Real-time | Socket.io 4 |
| Logger | Pino 10 |
| Testes | Vitest 4 |
| Monorepo | npm workspaces |

---

## Documentação Adicional

- [`docs/guia_tecnico_xua.md`](xua-delivery/docs/guia_tecnico_xua.md) — Schema completo do banco, arquitetura, KPIs e estados dos pedidos
- [`docs/fluxo_usuarios_xua.md`](xua-delivery/docs/fluxo_usuarios_xua.md) — Fluxo de telas por perfil de usuário
- [`docs/fluxo_telas.html`](xua-delivery/docs/fluxo_telas.html) — Diagrama visual de navegação
- [`docs/contracts/api-routes.md`](xua-delivery/docs/contracts/api-routes.md) — Contrato das rotas da API
