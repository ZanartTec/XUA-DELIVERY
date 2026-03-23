# Xuá Delivery

Plataforma fullstack de delivery de água mineral em garrafão retornável 20L. Todo o sistema roda em um único projeto Next.js: frontend React, API Route Handlers, Socket.io (real-time), cron jobs e integração com PostgreSQL e Redis.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|---|---|---|
| **Node.js** | 20 LTS | Recomendado via [nvm](https://github.com/nvm-sh/nvm) |
| **PostgreSQL** | 16 | Schema criado manualmente (ver seção abaixo) |
| **Redis** | 7 | Usado para JWT blacklist e cache de OTP |
| **npm** | 10+ | Incluído no Node.js 20 |

---

## Instalação

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd xua-delivery

# 2. Instale as dependências
npm install
```

---

## Variáveis de Ambiente

Copie o arquivo de exemplo e preencha os valores reais:

```bash
cp .env.example .env.local
```

Edite o `.env.local` com seus dados:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NODE_ENV` | Não | `development` ou `production` (default: `development`) |
| `PORT` | Não | Porta do servidor (default: `3000`) |
| `HOSTNAME` | Não | Hostname do servidor (default: `localhost`) |
| `DATABASE_URL` | **Sim** | String de conexão PostgreSQL |
| `REDIS_URL` | **Sim** | String de conexão Redis |
| `JWT_SECRET` | **Sim** | Chave HMAC-SHA256 para JWT (mínimo 32 caracteres) |
| `OTP_SECRET` | **Sim** | Chave HMAC para geração de OTPs de entrega |
| `PAYMENT_WEBHOOK_SECRET` | **Sim** | Segredo do gateway de pagamento para HMAC dos webhooks |
| `ALLOWED_ORIGIN` | Em produção | Origem permitida no CORS (ex: `https://seudominio.com`) |

> **Atenção:** O servidor falha na inicialização com erro `FATAL:` se qualquer variável obrigatória estiver ausente.

---

## Banco de Dados

O projeto **não possui migrations automáticas**. O schema PostgreSQL deve ser criado manualmente antes de iniciar o servidor.

O schema completo (19 tabelas, 9 enums, 26 índices e trigger de proteção de estado) está documentado em [`docs/guia_tecnico_xua.md`](docs/guia_tecnico_xua.md).

**Tabelas criadas:**

```
01_mst_consumers         — Consumidores
02_mst_addresses         — Endereços de entrega
03_mst_distributors      — Distribuidores parceiros
04_mst_zones             — Zonas de cobertura
05_mst_zone_coverage     — Bairros/CEPs por zona
06_mst_products          — Catálogo de produtos
07_cfg_delivery_capacity — Slots de capacidade (anti-overbooking)
08_sec_consumer_push_tokens
09_trn_orders            — Pedidos (máquina de estados com 13 estados)
10_trn_order_items
11_trn_subscriptions     — Assinaturas mensais
12_piv_subscription_orders
13_trn_payments
14_cfg_payment_webhook_events — Idempotência de webhooks
15_trn_deposits          — Caução de vasilhame
16_sec_order_otps        — OTPs de entrega (TTL 90min, max 5 tentativas)
17_trn_reconciliations   — Conciliação diária de vasilhames
18_aud_audit_events      — Auditoria append-only (fonte dos KPIs)
```

---

## Como Rodar

### Desenvolvimento

```bash
npm run dev
```

Inicia o servidor Next.js com hot-reload em `http://localhost:3000`.

> **Nota:** O comando `dev` usa o servidor padrão do Next.js (`next dev`). Para testar funcionalidades de **Socket.io** e **cron jobs**, use o servidor customizado (ver abaixo).

### Desenvolvimento com Socket.io e Cron Jobs

O Socket.io e os cron jobs só estão disponíveis ao rodar via `server.ts`. Compile e execute:

```bash
# Compile o servidor customizado
npx tsc server.ts --outDir dist-server --esModuleInterop --module commonjs --target es2017 --moduleResolution node --skipLibCheck

# Execute
node dist-server/server.js
```

Ou adicione um script ao `package.json` para facilitar (ver seção Scripts).

### Produção

```bash
# 1. Gere o build de produção
npm run build

# 2. Inicie o servidor
npm start
```

Para produção com Socket.io, o servidor deve ser iniciado via `server.ts` compilado (ou via `ts-node`):

```bash
npx ts-node --project tsconfig.json server.ts
```

---

## Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor Next.js com hot-reload (sem Socket.io/cron) |
| `npm run build` | Gera o build otimizado de produção |
| `npm start` | Inicia o build de produção (sem Socket.io/cron) |
| `npm run lint` | Executa o ESLint no projeto |
| `npx tsc --noEmit` | Verifica erros de TypeScript sem gerar arquivos |

---

## Estrutura do Projeto

```
xua-delivery/
├── server.ts                  # Servidor customizado: Next.js + Socket.io + cron jobs
├── middleware.ts               # RBAC: autenticação JWT e controle de acesso por rota
├── next.config.ts
├── .env.example                # Template de variáveis de ambiente
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/                 # Rotas públicas: login, cadastro
│   ├── (consumer)/             # Área do consumidor (role: consumer)
│   ├── (distributor)/          # Área do distribuidor (role: distributor_admin, operator)
│   ├── (driver)/               # Módulo motorista (role: driver)
│   ├── (ops)/                  # Painel de operações (role: ops, support)
│   └── api/                    # Route Handlers (REST API)
│       ├── auth/               # login, logout, register
│       ├── consumers/          # perfil, endereços
│       ├── driver/             # rotas do motorista
│       ├── orders/             # pedidos, itens, OTP
│       ├── payments/           # webhook do gateway
│       ├── reconciliations/    # conciliação diária
│       ├── subscriptions/      # assinaturas mensais
│       └── zones/              # zonas e capacidade
│
└── src/
    ├── lib/
    │   ├── auth.ts             # signToken / verifyToken (jose HS256)
    │   ├── prisma.ts            # Prisma ORM (PostgreSQL)
    │   ├── redis.ts            # ioredis
    │   ├── tables.ts           # Constantes com nomes de tabelas
    │   ├── api-handler.ts      # Wrapper de error handling para Route Handlers
    │   └── socket.ts           # Helper para emitir eventos Socket.io
    ├── services/               # Lógica de negócio
    │   ├── order-service.ts    # Máquina de estados de pedidos
    │   ├── capacity-service.ts # Anti-overbooking (SELECT FOR UPDATE)
    │   ├── otp-service.ts      # Geração/verificação de OTP
    │   ├── deposit-service.ts  # Caução de vasilhame
    │   ├── kpi-service.ts      # KPIs via audit_events
    │   ├── subscription-cron.ts # Cron 06h: gera pedidos de assinatura
    │   └── otp-cleanup.ts      # Cron 15min: expira OTPs vencidos
    ├── repositories/           # Queries SQL (Prisma)
    ├── schemas/                # Validação Zod
    ├── components/             # Componentes React reutilizáveis
    ├── store/                  # Estado global Zustand
    └── types/                  # Tipos TypeScript
```

---

## Perfis de Acesso (RBAC)

| Role JWT | Área | Permissões principais |
|---|---|---|
| `consumer` | `/app` | Realizar pedidos, acompanhar status, gerenciar assinatura |
| `distributor_admin` | `/distributor` | Aceitar/recusar pedidos, despachar, dashboard KPIs |
| `operator` | `/distributor` | Operações do dia a dia do distribuidor |
| `driver` | `/driver` | Confirmar entregas via OTP, registrar troca de vasilhame |
| `ops` | `/ops` | Configurar zonas/capacidade, KPIs globais, override de OTP |
| `support` | `/ops` | Console de suporte, timeline de eventos, exportar auditoria |

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| UI | Tailwind CSS 4, shadcn/ui |
| Estado cliente | Zustand 5 |
| Validação | Zod 4 |
| Banco de dados | PostgreSQL 16 via Prisma 7 |
| Cache / sessões | Redis 7 via ioredis |
| Auth | JWT (jose) + bcryptjs |
| Real-time | Socket.io 4 |
| Cron jobs | node-cron 4 |

---

## Documentação Adicional

- [`xua-delivery/docs/guia_tecnico_xua.md`](docs/guia_tecnico_xua.md) — Schema completo do banco, arquitetura, KPIs e estados dos pedidos
- [`xua-delivery/docs/fluxo_usuarios_xua.md`](docs/fluxo_usuarios_xua.md) — Fluxo de telas por perfil de usuário
- [`xua-delivery/docs/fluxo_telas.html`](docs/fluxo_telas.html) — Diagrama visual de navegação
- [`xua-delivery/.env.example`](.env.example) — Template de variáveis de ambiente
