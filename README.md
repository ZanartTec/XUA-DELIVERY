# Xuá Delivery

Plataforma fullstack de delivery de água mineral em garrafão retornável 20L.

Organizado como **monorepo npm workspaces** com dois apps independentes:
- **`apps/api`** — API REST + Socket.io (Express 5, porta 3000) e worker BullMQ
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
sec_order_otps           — OTPs de entrega (TTL 90min, max 5 tentativas)
trn_reconciliations      — Conciliação diária de vasilhames
aud_audit_events         — Auditoria append-only (fonte dos KPIs)
```

---

## Como Rodar

O padrão do projeto é **infraestrutura em Docker + apps rodando nativos** — API e Web usam
hot-reload (`tsx watch` / `next dev`), que é bem mais rápido fora de container. Só Postgres e
Redis sobem via Docker.

### 1. Suba a infraestrutura (Postgres + Redis)

```bash
cd xua-delivery
docker compose up -d
```

Isso sobe dois containers definidos em [`docker-compose.yml`](xua-delivery/docker-compose.yml):

| Serviço | Container | Porta no host | Porta no container |
|---|---|---|---|
| PostgreSQL 16 | `xua-postgres` | `5433` | `5432` |
| Redis 7 | `xua-redis` | `6379` | `6379` |

> **Por que 5433 e não 5432?** Evita conflito com um Postgres local (nativo ou de outro
> projeto/container) que já ocupe a porta padrão. Se a 5432 estiver livre na sua máquina, pode
> trocar o mapeamento de volta para `"5432:5432"` no `docker-compose.yml` — só lembre de
> atualizar o `DATABASE_URL` do próximo passo para bater com a porta escolhida.

Confira se os dois estão de pé e saudáveis:

```bash
docker compose ps
```

### 2. Configure o `.env` da API para apontar pro Postgres local

`apps/api/.env` já vem com as duas opções comentadas — deixe ativa a **Opção A**:

```bash
# ─── Banco de Dados (PostgreSQL) ───────────────────────────────
# Opção A — Docker local (docker compose up -d):
DATABASE_URL="postgresql://xua:xua_secret_change_me@localhost:5433/xua_delivery"

# Opção B — Render (PRODUÇÃO — evite usar no dev local, grava em dados reais):
#DATABASE_URL="postgresql://xua:...@....render.com/xua?sslmode=require"
```

`REDIS_URL="redis://localhost:6379"` já aponta pro Redis do compose por padrão.

### 3. Primeira vez: aplique as migrations e gere o Prisma Client

Rodado a partir da raiz de `xua-delivery/` (o `prisma.config.ts` não lê `apps/api/.env`
automaticamente, então passe a `DATABASE_URL` explícita neste passo único de setup):

```bash
DATABASE_URL="postgresql://xua:xua_secret_change_me@localhost:5433/xua_delivery" npx prisma migrate deploy
DATABASE_URL="postgresql://xua:xua_secret_change_me@localhost:5433/xua_delivery" npx prisma generate
```

### 4. Rode API e Web

```bash
# API (porta 3000, conforme apps/api/.env) + Web (porta 3001) em paralelo
npm run dev

# Ou separadamente:
npm run dev:api
npm run dev:web
```

A API usa `tsx watch` com hot-reload nativo (lê `apps/api/.env` sozinha). O frontend usa
`next dev`. Teste rapidamente com:

```bash
curl http://localhost:3000/health
```

### 5. Parar/limpar

```bash
# Para os containers, mantém os dados no volume
docker compose down

# Para os containers E apaga os dados (banco/redis zerados)
docker compose down -v
```

### Rotina do dia a dia

Depois do setup inicial (passos 1–3, feitos uma vez), o ciclo normal é só:

```bash
docker compose up -d   # sobe infra (se não estiver rodando)
npm run dev             # sobe API + Web com hot-reload
```

### Produção

Produção roda no **Render**, sem Docker: API, Web e Worker são serviços Node nativos, e
Postgres e Redis são serviços gerenciados.

| Serviço Render | Tipo | Equivale a |
|---|---|---|
| `xua-api` | Web Service (Node) | `npm run start:api` |
| `xua-web` | Web Service (Node) | `npm run build:web` + `npm run start:web` |
| `xua-worker` | Background Worker (Node) | `npm run worker -w @xua/api` |
| `xua-bd` | PostgreSQL gerenciado | `xua-postgres` do compose |
| `xua-redis` | Key Value gerenciado (Valkey, compatível com Redis) | `xua-redis` do compose |

Migrations em produção são aplicadas com `npx prisma migrate deploy` apontando o
`DATABASE_URL` para o `xua-bd`.

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
│   ├── api/                   # @xua/api — Express 5 (porta 3000)
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
