# Xuá Delivery — Plano Mestre de Migração para Web em Vercel + API em Render

> Documento operacional de referência para separar o produto atual em duas aplicações, sem quebrar a experiência do usuário e com estratégia de corte orientada a zero downtime.

---

## 1. Objetivo Deste Documento

Este guia descreve, em nível operacional e arquitetural, como migrar o Xuá Delivery do desenho atual, monolítico em Next.js, para o desenho alvo abaixo:

- Web em Vercel
- API em Render
- PostgreSQL gerenciado
- Redis gerenciado
- Código compartilhado em pacote comum

Este documento foi escrito para responder a cinco perguntas práticas:

1. Qual é a arquitetura alvo recomendada para front e back?
2. Qual é a árvore final de pastas recomendada?
3. Para cada arquivo atual, para onde ele deve ir no desenho futuro?
4. Em que ordem os PRs devem ser executados para não quebrar a aplicação?
5. Como validar, fazer rollout e executar rollback com segurança?

Este plano parte de três premissas já definidas:

- Produção terá domínio próprio
- O repositório continuará único no começo
- A meta operacional é chegar o mais perto possível de zero downtime

---

## 2. Resumo Executivo

### 2.1 Recomendação arquitetural

Para o Xuá Delivery, a arquitetura recomendada é:

- Uma aplicação Web fina em Next.js, hospedada na Vercel
- Uma API modular monolítica em Node.js, hospedada no Render
- Um pacote shared para tipos, enums, schemas e contratos
- PostgreSQL e Redis como infraestrutura gerenciada

### 2.2 O que NÃO fazer

Não é recomendado, para o estado atual do projeto:

- Extrair apenas Socket.IO e deixar a regra de negócio no Next atual
- Extrair apenas cron jobs e manter pedidos em outro runtime
- Deixar Prisma ou Redis do lado da Web
- Quebrar a API em microservices agora
- Reescrever o backend inteiro para outro framework no mesmo momento do corte de deploy

### 2.3 Estratégia central para não quebrar o produto

A estratégia central de segurança desta migração é:

1. Construir a nova Web e a nova API em paralelo ao monólito atual
2. Copiar e adaptar o código para o novo desenho antes de remover o desenho antigo
3. Preservar o contrato HTTP atual do navegador usando rewrite de `/api` na Web
4. Mover o WebSocket para o backend novo, apontando o cliente diretamente para ele
5. Mover os cron jobs para execução externa via Render Cron Jobs
6. Remover o código legado apenas depois do go-live e da estabilização

Em outras palavras: até o PR de corte, a regra operacional é copiar primeiro e remover por último.

---

## 3. Estado Atual do Projeto

Hoje o projeto é um monólito Next.js com forte acoplamento entre frontend, backend, realtime e jobs.

Os pontos que tornam o split delicado são:

- Servidor customizado com Socket.IO embutido em `server.ts`
- Cron jobs em processo em `server.ts`
- Regras de negócio que emitem eventos realtime diretamente em `src/services/ops/order-service.ts`
- Uso de Redis para blacklist, cache e rate limiting
- Uso de Prisma com transações de negócio
- Uso disseminado de `fetch("/api/..." )` no frontend
- Sessão baseada em cookie httpOnly

### 3.1 Arquivos críticos do desenho atual

- `server.ts`
- `proxy.ts`
- `app/api/**`
- `src/services/**`
- `src/repositories/**`
- `src/lib/prisma.ts`
- `src/lib/redis.ts`
- `src/lib/socket.ts`
- `src/lib/auth.ts`
- `src/lib/jwt-blacklist.ts`
- `src/hooks/use-socket.ts`
- `public/sw.js`

### 3.2 Implicações diretas para a migração

- O backend novo precisa nascer completo, não parcial
- A Web nova deve continuar enxergando `/api` como contrato principal
- O WebSocket não pode mais depender da leitura do JWT por `document.cookie`, porque o cookie atual é httpOnly
- Os jobs não devem continuar acoplados ao processo principal no desenho final

---

## 4. Arquitetura Alvo Recomendada

## 4.1 Desenho de alto nível

```text
Navegador
  -> app.seudominio.com (Vercel)
       -> páginas, layouts, PWA, client state, cache local
       -> chamadas HTTP para /api/*
       -> rewrite interno para api.seudominio.com
       -> conexão Socket.IO direta com api.seudominio.com

  -> api.seudominio.com (Render)
       -> auth
       -> RBAC real
       -> regras de negócio
       -> Prisma
       -> Redis
       -> Socket.IO
       -> webhooks
       -> jobs chamados por Render Cron Job

Infra
  -> PostgreSQL gerenciado
  -> Redis gerenciado
```

## 4.2 Responsabilidade da Web

A Web deve ser responsável por:

- Renderização de páginas e layouts
- Componentes e UX
- PWA e service worker
- Estado client-side
- Offline queue e replay
- Push subscription
- Consumo da API
- Socket client

A Web NÃO deve ser responsável por:

- Regras de negócio de pedido
- Autorização real
- Prisma
- Redis
- Cron
- Webhooks
- Emissão de eventos de negócio

## 4.3 Responsabilidade da API

A API deve ser responsável por:

- Autenticação e sessão
- RBAC real
- Regras de negócio
- Persistência via Prisma
- Cache e blacklist via Redis
- Webhooks de pagamento
- Emissão de eventos realtime
- Execução de jobs
- Observabilidade operacional

## 4.4 Responsabilidade do pacote shared

O pacote shared deve conter somente:

- Tipos de domínio
- Enums
- Schemas Zod
- Contratos de request e response
- Constantes compartilhadas sem dependência de runtime

O pacote shared não deve conter:

- Código de browser
- Código Node específico
- Prisma client
- Redis client
- Next.js APIs

---

## 5. Estrutura Alvo de Pastas

```text
xua-delivery/
  package.json
  package-lock.json
  tsconfig.base.json
  eslint.config.mjs
  docker-compose.yml
  docs/
  apps/
    web/
      package.json
      tsconfig.json
      next.config.ts
      proxy.ts
      postcss.config.mjs
      app/
        layout.tsx
        page.tsx
        providers.tsx
        globals.css
        (auth)/
          layout.tsx
          login/page.tsx
          register/page.tsx
        (consumer)/
          layout.tsx
          catalog/page.tsx
          cart/page.tsx
          checkout/
            schedule/page.tsx
            payment/page.tsx
            confirmation/page.tsx
          orders/
            page.tsx
            [id]/page.tsx
          profile/
            page.tsx
            edit/page.tsx
            addresses/page.tsx
          subscription/
            create/page.tsx
            manage/page.tsx
        (distributor)/
          layout.tsx
          distributor/
            queue/page.tsx
            kpis/page.tsx
            reconciliation/page.tsx
            routes/[id]/page.tsx
            orders/
              [id]/page.tsx
              [id]/checklist/page.tsx
        (driver)/
          layout.tsx
          driver/
            deliveries/page.tsx
            deliveries/[id]/otp/page.tsx
            deliveries/[id]/exchange/page.tsx
            deliveries/[id]/non-collection/page.tsx
        (ops)/
          layout.tsx
          ops/
            zones/page.tsx
            kpis/page.tsx
            otp-override/page.tsx
            audit-export/page.tsx
          support/
            page.tsx
            [id]/page.tsx
      src/
        components/
          ui/
          shared/
            distributor/
            driver/
        hooks/
          consumer/
        store/
        lib/
          api-client.ts
          offline-queue.ts
          utils.ts
      public/
        manifest.json
        sw.js
        icons/
          icon.svg
          icon-192.png
          icon-512.png
          icon-512-maskable.png
          apple-touch-icon.png
    api/
      package.json
      tsconfig.json
      prisma.config.ts
      prisma/
        schema.prisma
        migrations/
        seed.ts
      src/
        server/
          index.ts
          health.ts
          readiness.ts
        http/
          app.ts
          routes.ts
        middleware/
          auth.ts
          rbac.ts
          error-handler.ts
        modules/
          auth/
            auth.routes.ts
            auth.controller.ts
            auth.service.ts
          orders/
            orders.routes.ts
            orders.controller.ts
            orders.service.ts
            orders.repository.ts
          consumers/
            consumers.routes.ts
            consumers.controller.ts
            consumers.service.ts
            consumers.repository.ts
          subscriptions/
            subscriptions.routes.ts
            subscriptions.controller.ts
            subscriptions.service.ts
          zones/
            zones.routes.ts
            zones.controller.ts
            zones.service.ts
          driver/
            driver.routes.ts
            driver.controller.ts
            otp.service.ts
            otp.repository.ts
          distributor/
            distributor.routes.ts
            distributor.controller.ts
            capacity.service.ts
            capacity.repository.ts
            kpi.service.ts
          ops/
            ops.routes.ts
            ops.controller.ts
            order.service.ts
          notifications/
            notifications.routes.ts
            notifications.controller.ts
            notification.service.ts
          payments/
            payments.routes.ts
            payments.controller.ts
            webhook.service.ts
          audit/
            audit.routes.ts
            audit.controller.ts
            audit.repository.ts
        infra/
          auth/
            jwt.ts
            blacklist.ts
          prisma/
            client.ts
          redis/
            client.ts
          socket/
            gateway.ts
          logger/
            index.ts
          rate-limit/
            limiter.ts
          cep/
            viacep.ts
        jobs/
          subscription-job.ts
          otp-cleanup-job.ts
          internal-job-auth.ts
        tests/
          order-state-machine.test.ts
          rate-limit.test.ts
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        types/
          index.ts
        enums/
          index.ts
        schemas/
          auth.ts
          order.ts
          consumer.ts
          zone.ts
          audit.ts
        contracts/
          api.ts
```

---

## 6. Regras de Migração para Não Quebrar a Aplicação

Estas regras são obrigatórias durante a execução dos PRs.

### 6.1 Regra principal

Até o PR de cutover, quase tudo deve ser implementado como cópia e adaptação, não como remoção do código original.

### 6.2 Regras operacionais

1. Não remover o monólito atual enquanto a nova Web e a nova API não estiverem estáveis em staging.
2. Não mudar todos os `fetch("/api/..." )` do frontend antes do rewrite da Web estar funcionando.
3. Não ligar cron novo enquanto o cron antigo ainda executa o mesmo job.
4. Não mudar auth, socket e jobs no mesmo PR.
5. Não fazer refactor de arquitetura e refactor estético juntos.
6. Não depender do frontend para autorização real.
7. Não deletar arquivos antigos antes do PR final de limpeza.

### 6.3 Estratégia de corte

O corte seguro é:

1. API nova publicada no Render
2. Web nova publicada na Vercel
3. Rewrite `/api` ativo na Web
4. Socket client apontando para a API nova
5. Jobs antigos desligados apenas depois da ativação confirmada dos jobs novos

---

## 7. Mapeamento Arquivo Atual -> Arquivo Futuro

## 7.1 Workspace e raiz

| Atual | Futuro | Observação |
|---|---|---|
| `package.json` | `package.json` na raiz | Vira orquestrador de workspace |
| `package-lock.json` | `package-lock.json` na raiz | Mantido |
| `tsconfig.json` | `tsconfig.base.json` na raiz + `tsconfig.json` por app | Reorganização |
| `eslint.config.mjs` | `eslint.config.mjs` na raiz ou compartilhado | Mantido |
| `docker-compose.yml` | `docker-compose.yml` na raiz | Desenvolvimento local |
| `docs/**` | `docs/**` na raiz | Mantido |

## 7.2 Web — shell, páginas e assets

| Atual | Futuro |
|---|---|
| `app/layout.tsx` | `apps/web/app/layout.tsx` |
| `app/page.tsx` | `apps/web/app/page.tsx` |
| `app/providers.tsx` | `apps/web/app/providers.tsx` |
| `app/globals.css` | `apps/web/app/globals.css` |
| `app/(auth)/layout.tsx` | `apps/web/app/(auth)/layout.tsx` |
| `app/(auth)/login/page.tsx` | `apps/web/app/(auth)/login/page.tsx` |
| `app/(auth)/register/page.tsx` | `apps/web/app/(auth)/register/page.tsx` |
| `app/(consumer)/layout.tsx` | `apps/web/app/(consumer)/layout.tsx` |
| `app/(consumer)/catalog/page.tsx` | `apps/web/app/(consumer)/catalog/page.tsx` |
| `app/(consumer)/cart/page.tsx` | `apps/web/app/(consumer)/cart/page.tsx` |
| `app/(consumer)/checkout/schedule/page.tsx` | `apps/web/app/(consumer)/checkout/schedule/page.tsx` |
| `app/(consumer)/checkout/payment/page.tsx` | `apps/web/app/(consumer)/checkout/payment/page.tsx` |
| `app/(consumer)/checkout/confirmation/page.tsx` | `apps/web/app/(consumer)/checkout/confirmation/page.tsx` |
| `app/(consumer)/orders/page.tsx` | `apps/web/app/(consumer)/orders/page.tsx` |
| `app/(consumer)/orders/[id]/page.tsx` | `apps/web/app/(consumer)/orders/[id]/page.tsx` |
| `app/(consumer)/profile/page.tsx` | `apps/web/app/(consumer)/profile/page.tsx` |
| `app/(consumer)/profile/edit/page.tsx` | `apps/web/app/(consumer)/profile/edit/page.tsx` |
| `app/(consumer)/profile/addresses/page.tsx` | `apps/web/app/(consumer)/profile/addresses/page.tsx` |
| `app/(consumer)/subscription/create/page.tsx` | `apps/web/app/(consumer)/subscription/create/page.tsx` |
| `app/(consumer)/subscription/manage/page.tsx` | `apps/web/app/(consumer)/subscription/manage/page.tsx` |
| `app/(distributor)/layout.tsx` | `apps/web/app/(distributor)/layout.tsx` |
| `app/(distributor)/distributor/queue/page.tsx` | `apps/web/app/(distributor)/distributor/queue/page.tsx` |
| `app/(distributor)/distributor/kpis/page.tsx` | `apps/web/app/(distributor)/distributor/kpis/page.tsx` |
| `app/(distributor)/distributor/reconciliation/page.tsx` | `apps/web/app/(distributor)/distributor/reconciliation/page.tsx` |
| `app/(distributor)/distributor/routes/[id]/page.tsx` | `apps/web/app/(distributor)/distributor/routes/[id]/page.tsx` |
| `app/(distributor)/distributor/orders/[id]/page.tsx` | `apps/web/app/(distributor)/distributor/orders/[id]/page.tsx` |
| `app/(distributor)/distributor/orders/[id]/checklist/page.tsx` | `apps/web/app/(distributor)/distributor/orders/[id]/checklist/page.tsx` |
| `app/(driver)/layout.tsx` | `apps/web/app/(driver)/layout.tsx` |
| `app/(driver)/driver/deliveries/page.tsx` | `apps/web/app/(driver)/driver/deliveries/page.tsx` |
| `app/(driver)/driver/deliveries/[id]/otp/page.tsx` | `apps/web/app/(driver)/driver/deliveries/[id]/otp/page.tsx` |
| `app/(driver)/driver/deliveries/[id]/exchange/page.tsx` | `apps/web/app/(driver)/driver/deliveries/[id]/exchange/page.tsx` |
| `app/(driver)/driver/deliveries/[id]/non-collection/page.tsx` | `apps/web/app/(driver)/driver/deliveries/[id]/non-collection/page.tsx` |
| `app/(ops)/layout.tsx` | `apps/web/app/(ops)/layout.tsx` |
| `app/(ops)/ops/zones/page.tsx` | `apps/web/app/(ops)/ops/zones/page.tsx` |
| `app/(ops)/ops/kpis/page.tsx` | `apps/web/app/(ops)/ops/kpis/page.tsx` |
| `app/(ops)/ops/otp-override/page.tsx` | `apps/web/app/(ops)/ops/otp-override/page.tsx` |
| `app/(ops)/ops/audit-export/page.tsx` | `apps/web/app/(ops)/ops/audit-export/page.tsx` |
| `app/(ops)/support/page.tsx` | `apps/web/app/(ops)/support/page.tsx` |
| `app/(ops)/support/[id]/page.tsx` | `apps/web/app/(ops)/support/[id]/page.tsx` |
| `public/manifest.json` | `apps/web/public/manifest.json` |
| `public/sw.js` | `apps/web/public/sw.js` |
| `public/icons/icon.svg` | `apps/web/public/icons/icon.svg` |
| `public/file.svg` | `apps/web/public/file.svg` |
| `public/globe.svg` | `apps/web/public/globe.svg` |
| `public/logo.png` | `apps/web/public/logo.png` |
| `public/next.svg` | `apps/web/public/next.svg` |
| `public/vercel.svg` | `apps/web/public/vercel.svg` |
| `public/window.svg` | `apps/web/public/window.svg` |

## 7.3 Web — componentes, hooks, store e libs

| Atual | Futuro |
|---|---|
| `src/components/ui/*` | `apps/web/src/components/ui/*` |
| `src/components/shared/offline-banner.tsx` | `apps/web/src/components/shared/offline-banner.tsx` |
| `src/components/shared/logout-button.tsx` | `apps/web/src/components/shared/logout-button.tsx` |
| `src/components/shared/order-timeline.tsx` | `apps/web/src/components/shared/order-timeline.tsx` |
| `src/components/shared/pwa-install-prompt.tsx` | `apps/web/src/components/shared/pwa-install-prompt.tsx` |
| `src/components/shared/period-selector.tsx` | `apps/web/src/components/shared/period-selector.tsx` |
| `src/components/shared/kpi-chart.tsx` | `apps/web/src/components/shared/kpi-chart.tsx` |
| `src/components/shared/status-pill.tsx` | `apps/web/src/components/shared/status-pill.tsx` |
| `src/components/shared/distributor/sla-countdown.tsx` | `apps/web/src/components/shared/distributor/sla-countdown.tsx` |
| `src/components/shared/driver/otp-input.tsx` | `apps/web/src/components/shared/driver/otp-input.tsx` |
| `src/hooks/use-socket.ts` | `apps/web/src/hooks/use-socket.ts` |
| `src/hooks/use-pwa.ts` | `apps/web/src/hooks/use-pwa.ts` |
| `src/hooks/use-offline-sync.ts` | `apps/web/src/hooks/use-offline-sync.ts` |
| `src/hooks/consumer/use-push-subscription.ts` | `apps/web/src/hooks/consumer/use-push-subscription.ts` |
| `src/store/auth.ts` | `apps/web/src/store/auth.ts` |
| `src/store/cart.ts` | `apps/web/src/store/cart.ts` |
| `src/lib/api-client.ts` | `apps/web/src/lib/api-client.ts` |
| `src/lib/offline-queue.ts` | `apps/web/src/lib/offline-queue.ts` |
| `src/lib/utils.ts` | `apps/web/src/lib/utils.ts` |
| `next.config.ts` | `apps/web/next.config.ts` |
| `proxy.ts` | `apps/web/proxy.ts` |
| `postcss.config.mjs` | `apps/web/postcss.config.mjs` |

## 7.4 API — rotas e módulos

| Atual | Futuro |
|---|---|
| `server.ts` | `apps/api/src/server/index.ts` |
| `app/api/auth/login/route.ts` | `apps/api/src/modules/auth/auth.routes.ts` + `auth.controller.ts` |
| `app/api/auth/register/route.ts` | `apps/api/src/modules/auth/auth.routes.ts` + `auth.controller.ts` |
| `app/api/auth/logout/route.ts` | `apps/api/src/modules/auth/auth.routes.ts` + `auth.controller.ts` |
| `app/api/auth/me/route.ts` | `apps/api/src/modules/auth/auth.routes.ts` + `auth.controller.ts` |
| `app/api/auth/check-blacklist/route.ts` | `apps/api/src/modules/auth/auth.routes.ts` + `auth.controller.ts` |
| `app/api/orders/route.ts` | `apps/api/src/modules/orders/orders.routes.ts` + `orders.controller.ts` |
| `app/api/orders/[id]/route.ts` | `apps/api/src/modules/orders/orders.routes.ts` + `orders.controller.ts` |
| `app/api/orders/[id]/rating/route.ts` | `apps/api/src/modules/orders/orders.routes.ts` + `orders.controller.ts` |
| `app/api/orders/[id]/bottle-exchange/route.ts` | `apps/api/src/modules/orders/orders.routes.ts` + `orders.controller.ts` |
| `app/api/orders/[id]/empty-not-collected/route.ts` | `apps/api/src/modules/orders/orders.routes.ts` + `orders.controller.ts` |
| `app/api/products/route.ts` | `apps/api/src/modules/orders/orders.routes.ts` ou módulo `products` |
| `app/api/consumers/[id]/route.ts` | `apps/api/src/modules/consumers/consumers.routes.ts` + `consumers.controller.ts` |
| `app/api/consumers/[id]/addresses/route.ts` | `apps/api/src/modules/consumers/consumers.routes.ts` + `consumers.controller.ts` |
| `app/api/consumers/[id]/deposit-preview/route.ts` | `apps/api/src/modules/consumers/consumers.routes.ts` + `consumers.controller.ts` |
| `app/api/subscriptions/route.ts` | `apps/api/src/modules/subscriptions/subscriptions.routes.ts` + `subscriptions.controller.ts` |
| `app/api/subscriptions/[id]/route.ts` | `apps/api/src/modules/subscriptions/subscriptions.routes.ts` + `subscriptions.controller.ts` |
| `app/api/zones/route.ts` | `apps/api/src/modules/zones/zones.routes.ts` + `zones.controller.ts` |
| `app/api/zones/[id]/route.ts` | `apps/api/src/modules/zones/zones.routes.ts` + `zones.controller.ts` |
| `app/api/zones/[id]/capacity/route.ts` | `apps/api/src/modules/zones/zones.routes.ts` + `zones.controller.ts` |
| `app/api/zones/[id]/coverage/route.ts` | `apps/api/src/modules/zones/zones.routes.ts` + `zones.controller.ts` |
| `app/api/driver/deliveries/route.ts` | `apps/api/src/modules/driver/driver.routes.ts` + `driver.controller.ts` |
| `app/api/reconciliations/route.ts` | `apps/api/src/modules/distributor/distributor.routes.ts` + `distributor.controller.ts` |
| `app/api/kpis/route.ts` | `apps/api/src/modules/distributor/distributor.routes.ts` + `distributor.controller.ts` |
| `app/api/notifications/subscribe/route.ts` | `apps/api/src/modules/notifications/notifications.routes.ts` + `notifications.controller.ts` |
| `app/api/payments/webhook/route.ts` | `apps/api/src/modules/payments/payments.routes.ts` + `payments.controller.ts` |
| `app/api/audit/export/route.ts` | `apps/api/src/modules/audit/audit.routes.ts` + `audit.controller.ts` |

## 7.5 API — services, repositories e infraestrutura

| Atual | Futuro |
|---|---|
| `src/services/ops/order-service.ts` | `apps/api/src/modules/ops/order.service.ts` |
| `src/services/ops/subscription-cron.ts` | `apps/api/src/jobs/subscription-job.ts` |
| `src/services/ops/otp-cleanup.ts` | `apps/api/src/jobs/otp-cleanup-job.ts` |
| `src/services/driver/otp-service.ts` | `apps/api/src/modules/driver/otp.service.ts` |
| `src/services/distributor/capacity-service.ts` | `apps/api/src/modules/distributor/capacity.service.ts` |
| `src/services/distributor/kpi-service.ts` | `apps/api/src/modules/distributor/kpi.service.ts` |
| `src/services/consumer/subscription-service.ts` | `apps/api/src/modules/subscriptions/subscriptions.service.ts` |
| `src/services/consumer/payment-service.ts` | `apps/api/src/modules/payments/payment.service.ts` |
| `src/services/consumer/payment-gateway.ts` | `apps/api/src/modules/payments/payment-gateway.ts` |
| `src/services/consumer/notification-service.ts` | `apps/api/src/modules/notifications/notification.service.ts` |
| `src/services/consumer/deposit-service.ts` | `apps/api/src/modules/consumers/deposit.service.ts` |
| `src/services/consumer/adapters/mock-payment-adapter.ts` | `apps/api/src/modules/payments/adapters/mock-payment-adapter.ts` |
| `src/repositories/ops/order-repository.ts` | `apps/api/src/modules/orders/orders.repository.ts` |
| `src/repositories/driver/otp-repository.ts` | `apps/api/src/modules/driver/otp.repository.ts` |
| `src/repositories/distributor/capacity-repository.ts` | `apps/api/src/modules/distributor/capacity.repository.ts` |
| `src/repositories/consumer/consumer-repository.ts` | `apps/api/src/modules/consumers/consumers.repository.ts` |
| `src/repositories/audit-repository.ts` | `apps/api/src/modules/audit/audit.repository.ts` |
| `src/lib/prisma.ts` | `apps/api/src/infra/prisma/client.ts` |
| `src/lib/redis.ts` | `apps/api/src/infra/redis/client.ts` |
| `src/lib/socket.ts` | `apps/api/src/infra/socket/gateway.ts` |
| `src/lib/auth.ts` | `apps/api/src/infra/auth/jwt.ts` |
| `src/lib/jwt-blacklist.ts` | `apps/api/src/infra/auth/blacklist.ts` |
| `src/lib/rate-limit.ts` | `apps/api/src/infra/rate-limit/limiter.ts` |
| `src/lib/logger.ts` | `apps/api/src/infra/logger/index.ts` |
| `src/lib/cep.ts` | `apps/api/src/infra/cep/viacep.ts` |
| `src/lib/api-handler.ts` | `apps/api/src/middleware/error-handler.ts` |
| `src/services/__tests__/order-state-machine.test.ts` | `apps/api/src/tests/order-state-machine.test.ts` |
| `src/lib/__tests__/rate-limit.test.ts` | `apps/api/src/tests/rate-limit.test.ts` |

## 7.6 Shared — tipos, enums e schemas

| Atual | Futuro |
|---|---|
| `src/types/index.ts` | `packages/shared/src/types/index.ts` |
| `src/types/enums.ts` | `packages/shared/src/enums/index.ts` |
| `src/schemas/auth.ts` | `packages/shared/src/schemas/auth.ts` |
| `src/schemas/order.ts` | `packages/shared/src/schemas/order.ts` |
| `src/schemas/consumer/consumer.ts` | `packages/shared/src/schemas/consumer.ts` |
| `src/schemas/distributor/zone.ts` | `packages/shared/src/schemas/zone.ts` |
| `src/schemas/ops/audit.ts` | `packages/shared/src/schemas/audit.ts` |

## 7.7 Legado a remover somente após estabilização

| Atual | Destino |
|---|---|
| `components/ui/*` | remover após consolidar `src/components/ui/*` |
| `lib/utils.ts` | remover se auditoria final confirmar zero uso |
| `server.ts` na raiz | remover após o backend novo ser definitivo |
| `app/api/**` na raiz antiga | remover após o cutover da Web e da API |

---

## 8. Matriz de Variáveis de Ambiente

## 8.1 Variáveis atuais identificadas

| Variável | Uso atual | App dono no desenho novo |
|---|---|---|
| `DATABASE_URL` | Prisma | API |
| `REDIS_URL` | Redis | API |
| `JWT_SECRET` | Auth e proxy | API |
| `INTERNAL_SECRET` | Blacklist interna | API |
| `OTP_SECRET` | HMAC OTP | API |
| `ALLOWED_ORIGIN` | CORS/socket produção | API |
| `HOSTNAME` | Bootstrap server | API |
| `PORT` | Bootstrap server | API |
| `LOG_LEVEL` | Logger | API |
| `PAYMENT_WEBHOOK_SECRET` | Validação webhook | API |
| `PAYMENT_PROVIDER` | Gateway mock/real | API |
| `VAPID_PUBLIC_KEY` | Web push server-side | API |
| `VAPID_PRIVATE_KEY` | Web push server-side | API |
| `VAPID_EMAIL` | Web push server-side | API |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push subscription no browser | Web |

## 8.2 Variáveis novas recomendadas

| Variável | App | Finalidade |
|---|---|---|
| `COOKIE_DOMAIN` | API | Exemplo: `.seudominio.com` |
| `APP_ORIGIN` | API | Exemplo: `https://app.seudominio.com` |
| `API_ORIGIN` | API e Web | Exemplo: `https://api.seudominio.com` |
| `NEXT_PUBLIC_WS_URL` | Web | URL do Socket.IO do backend |
| `INTERNAL_JOB_SECRET` | API | Autenticação dos endpoints de job |
| `REWRITE_API_TARGET` | Web | Destino dos rewrites `/api` |

## 8.3 Regras para cookies e auth

Para o desenho alvo:

- O cookie deve ser `httpOnly`
- O cookie deve ser `secure` em produção
- O cookie deve ser emitido com domínio compartilhável entre subdomínios, quando aplicável
- O navegador deve continuar falando com `/api` via rewrite da Web
- A autorização real deve ocorrer no backend

---

## 9. Estratégia de PRs

## 9.1 Princípios de execução

Cada PR deve obedecer a estes princípios:

1. Ter objetivo único
2. Ser revertível de forma simples
3. Ser testável em isolamento
4. Não misturar refactor estrutural com mudança de comportamento desnecessária
5. Não remover legado antes de o novo fluxo estar validado

## 9.2 Convenção sugerida

- `chore/*` para fundação e workspace
- `refactor/*` para extrações sem mudança de comportamento
- `feat/*` para módulos novos e integração
- `release/*` para corte operacional

---

## 10. Backlog de Migração por PR

## PR 01 — Fundação do Workspace

**Branch sugerida**

`chore/workspace-foundation`

**Objetivo**

Preparar o repositório para comportar `apps/web`, `apps/api` e `packages/shared`, sem mudar comportamento do sistema atual.

**Onde mexer**

- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- raiz do repositório
- criação das pastas `apps/` e `packages/`

**O que fazer**

1. Transformar a raiz em workspace
2. Criar manifestos mínimos de `apps/web`, `apps/api` e `packages/shared`
3. Criar `tsconfig` base compartilhado
4. Garantir que o monólito atual continua funcionando em paralelo

**Como fazer sem quebrar**

- Não mover o runtime atual ainda
- Não alterar import paths de negócio ainda
- Não alterar rotas, envs nem bootstrap de produção

**Validação obrigatória**

- Instalação funciona
- Lint continua executando
- O app atual continua subindo

**Rollback**

Reverter apenas a estrutura de workspace.

---

## PR 02 — Extração de Shared

**Branch sugerida**

`refactor/extract-shared-contracts`

**Objetivo**

Extrair tipos, enums e schemas para um pacote compartilhado.

**Onde mexer**

- `src/types/index.ts`
- `src/types/enums.ts`
- `src/schemas/auth.ts`
- `src/schemas/order.ts`
- `src/schemas/consumer/consumer.ts`
- `src/schemas/distributor/zone.ts`
- `src/schemas/ops/audit.ts`
- novos arquivos em `packages/shared/src/**`

**O que fazer**

1. Copiar o conteúdo atual para `packages/shared`
2. Ajustar imports para consumir shared
3. Manter o comportamento dos payloads inalterado

**Como fazer sem quebrar**

- Extrair contratos antes de extrair runtimes
- Não alterar shape de request/response
- Não misturar mudança de schema com mudança de regra de negócio

**Validação obrigatória**

- Typecheck limpo
- Build do app atual limpo
- Sem mudança nos contratos públicos

**Rollback**

Reverter os imports e devolver a origem para `src/**`.

---

## PR 03 — Bootstrap da API Nova

**Branch sugerida**

`feat/api-bootstrap`

**Objetivo**

Criar `apps/api` com bootstrap mínimo, healthcheck e readiness.

**Onde mexer**

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/server/index.ts`
- `apps/api/src/server/health.ts`
- `apps/api/src/server/readiness.ts`

**O que fazer**

1. Subir um processo Node independente
2. Expor endpoints de health e readiness
3. Configurar log mínimo

**Como fazer sem quebrar**

- Ainda não apontar tráfego real
- Ainda não migrar rotas de negócio
- Ainda não mexer no monólito atual

**Validação obrigatória**

- `GET /health` responde 200
- `GET /readiness` responde 200 quando dependências mínimas estão ok

**Rollback**

Reverter apenas `apps/api`.

---

## PR 04 — Infraestrutura Core da API

**Branch sugerida**

`refactor/api-infra-core`

**Objetivo**

Levar para a API nova toda a infraestrutura compartilhada de backend.

**Onde mexer**

- `src/lib/prisma.ts`
- `src/lib/redis.ts`
- `src/lib/logger.ts`
- `src/lib/auth.ts`
- `src/lib/jwt-blacklist.ts`
- `src/lib/rate-limit.ts`
- `src/lib/socket.ts`
- `server.ts`

**O que fazer**

1. Criar `infra/prisma/client.ts`
2. Criar `infra/redis/client.ts`
3. Criar `infra/auth/jwt.ts`
4. Criar `infra/auth/blacklist.ts`
5. Criar `infra/logger/index.ts`
6. Criar `infra/rate-limit/limiter.ts`
7. Criar `infra/socket/gateway.ts`

**Como fazer sem quebrar**

- Fazer por cópia, não por remoção
- Não mudar a regra de negócio ainda
- Não ligar a API nova à Web ainda

**Validação obrigatória**

- Prisma conecta
- Redis conecta
- JWT assina e verifica
- Socket inicializa sem crash

**Rollback**

Reverter apenas a infra da API nova.

---

## PR 05 — Módulo de Auth na API Nova

**Branch sugerida**

`feat/api-auth-module`

**Objetivo**

Migrar auth completa para a API nova.

**Onde mexer**

- `app/api/auth/login/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/me/route.ts`
- `app/api/auth/check-blacklist/route.ts`
- `proxy.ts`
- `apps/api/src/modules/auth/**`

**O que fazer**

1. Criar rotas de auth na API nova
2. Configurar cookie de sessão corretamente
3. Garantir blacklist e leitura de sessão
4. Preparar RBAC e middleware de auth da API

**Como fazer sem quebrar**

- Testar em staging com domínio realista de subdomínio
- Não alterar ainda o frontend para falar direto com a API nova
- Manter o fluxo atual íntegro até validar a sessão fim a fim

**Validação obrigatória**

- Login funciona
- Register funciona
- Logout funciona
- Auth/me retorna o usuário esperado
- Cookie sobrevive ao fluxo entre subdomínios no ambiente de staging

**Rollback**

Retornar auth para o runtime antigo.

---

## PR 06 — Orders Core na API Nova

**Branch sugerida**

`feat/api-orders-core`

**Objetivo**

Migrar o coração operacional do sistema: pedidos, OTP, auditoria e transições críticas.

**Onde mexer**

- `app/api/orders/route.ts`
- `app/api/orders/[id]/route.ts`
- `app/api/orders/[id]/rating/route.ts`
- `app/api/orders/[id]/bottle-exchange/route.ts`
- `app/api/orders/[id]/empty-not-collected/route.ts`
- `src/services/ops/order-service.ts`
- `src/services/driver/otp-service.ts`
- `src/repositories/ops/order-repository.ts`
- `src/repositories/driver/otp-repository.ts`
- `src/repositories/audit-repository.ts`

**O que fazer**

1. Criar módulo `orders`
2. Criar módulo `driver` com OTP
3. Ligar auditoria e transações
4. Preparar emissão de eventos pós-commit

**Como fazer sem quebrar**

- Este PR deve ser isolado do socket client da Web
- O comportamento das transições não pode mudar
- Os payloads devem ser equivalentes aos atuais

**Validação obrigatória**

- Criar pedido
- Aceitar pedido
- Rejeitar pedido
- Despachar pedido
- Gerar OTP
- Validar OTP
- Entregar pedido
- Registrar auditoria

**Rollback**

Apontar novamente rotas de orders para o backend antigo.

---

## PR 07 — Módulos Restantes da API

**Branch sugerida**

`feat/api-domain-modules-rest`

**Objetivo**

Migrar o restante do domínio funcional.

**Onde mexer**

- `app/api/consumers/**`
- `app/api/subscriptions/**`
- `app/api/zones/**`
- `app/api/driver/deliveries/route.ts`
- `app/api/reconciliations/route.ts`
- `app/api/kpis/route.ts`
- `app/api/notifications/subscribe/route.ts`
- `app/api/payments/webhook/route.ts`
- `app/api/audit/export/route.ts`
- `src/services/consumer/**`
- `src/services/distributor/**`
- `src/repositories/consumer/**`
- `src/repositories/distributor/**`

**O que fazer**

1. Fechar cobertura de domínio da API nova
2. Ligar webhooks, notificações, subscriptions, zones, KPIs e reconciliations

**Como fazer sem quebrar**

- Separar os módulos internamente
- Não fazer cleanup do legado ainda
- Validar cada módulo em staging antes de declarar pronto

**Validação obrigatória**

- CRUD e listagens de zones
- Fluxos de subscriptions
- KPIs
- Reconciliation
- Push subscription
- Webhook de pagamento

**Rollback**

Reencaminhar tráfego específico para o runtime anterior.

---

## PR 08 — Jobs Externos e Fim do Cron em Processo

**Branch sugerida**

`feat/api-jobs-externalized`

**Objetivo**

Retirar jobs do processo principal e mover a execução para Render Cron Jobs.

**Onde mexer**

- `src/services/ops/subscription-cron.ts`
- `src/services/ops/otp-cleanup.ts`
- `server.ts`
- `apps/api/src/jobs/**`

**O que fazer**

1. Criar endpoints internos de job protegidos por segredo
2. Criar job handlers dedicados
3. Configurar Render Cron Jobs
4. Desativar a dependência operacional de `node-cron` no desenho novo

**Como fazer sem quebrar**

- Durante a transição, garantir que apenas um scheduler esteja ativo por job
- Validar execução manual antes de ativar agendamento

**Validação obrigatória**

- Job de assinatura roda manualmente
- Job de limpeza OTP roda manualmente
- Cron externo chama ambos com sucesso

**Rollback**

Reativar temporariamente o scheduler antigo, se necessário.

---

## PR 09 — Web Nova em Paralelo

**Branch sugerida**

`feat/web-app-bootstrap`

**Objetivo**

Criar `apps/web` com páginas, layouts, componentes, hooks, stores e assets.

**Onde mexer**

- `app/**`
- `src/components/**`
- `src/hooks/**`
- `src/store/**`
- `src/lib/api-client.ts`
- `src/lib/offline-queue.ts`
- `src/lib/utils.ts`
- `public/**`

**O que fazer**

1. Copiar o frontend atual para `apps/web`
2. Manter a navegação e a UX atuais
3. Preparar a Web para consumir a API nova sem trocar ainda o tráfego em produção

**Como fazer sem quebrar**

- Não remover o frontend atual da raiz ainda
- Não trocar ainda os endpoints um a um
- Não alterar ainda o contrato `/api`

**Validação obrigatória**

- Build da Web funciona
- Navegação funciona
- PWA continua registrando service worker

**Rollback**

Reverter apenas `apps/web`.

---

## PR 10 — Rewrite de API na Web

**Branch sugerida**

`feat/web-api-rewrite`

**Objetivo**

Fazer a Web continuar usando `/api`, mas repassando internamente para a API nova.

**Onde mexer**

- `apps/web/next.config.ts`
- `apps/web/proxy.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/public/sw.js`

**O que fazer**

1. Criar rewrite `/api/:path*` -> API nova
2. Preservar fetch relativo no navegador
3. Validar service worker nesse novo desenho

**Como fazer sem quebrar**

- Não sair trocando todos os callsites de fetch manualmente
- Garantir que headers e cookies continuam fluindo corretamente

**Validação obrigatória**

- Login, catálogo, pedidos e perfil funcionando via rewrite
- Service worker não quebra o tráfego de API

**Rollback**

Desabilitar rewrite e retornar tráfego ao backend antigo.

---

## PR 11 — Realtime na Arquitetura Nova

**Branch sugerida**

`feat/web-realtime-cutover`

**Objetivo**

Ligar o socket client da Web ao backend novo.

**Onde mexer**

- `src/hooks/use-socket.ts`
- bootstrap de socket da API nova

**O que fazer**

1. Parar de depender da leitura do JWT por `document.cookie`
2. Apontar o socket client para a URL da API
3. Validar handshake autenticado corretamente

**Como fazer sem quebrar**

- Não misturar isso com alteração de orders
- Preparar fallback temporário por polling para telas críticas, se necessário

**Validação obrigatória**

- `new_order`
- `order_status_changed`
- `otp_generated`
- reconexão do socket

**Rollback**

Desabilitar realtime novo e operar temporariamente sem socket, se necessário.

---

## PR 12 — Cutover de Produção

**Branch sugerida**

`release/cutover-production`

**Objetivo**

Colocar a nova Web e a nova API em produção.

**Onde mexer**

- Configuração de deploy
- DNS
- envs de produção
- rewrites da Web
- ativação dos jobs externos

**O que fazer**

1. Publicar a API nova no Render
2. Publicar a Web nova na Vercel
3. Validar staging final
4. Fazer a troca de produção
5. Confirmar logs e métricas iniciais

**Como fazer sem quebrar**

- Fazer smoke test antes de apontar DNS definitivo
- Manter rollback pronto
- Não apagar o runtime anterior ainda

**Validação obrigatória**

- Auth ponta a ponta
- Fluxo completo de pedido
- Jobs rodando
- Socket funcionando
- Push e PWA funcionando

**Rollback**

Reapontar o tráfego e o DNS para o desenho anterior.

---

## PR 13 — Limpeza Pós-Go-Live

**Branch sugerida**

`chore/post-cutover-cleanup`

**Objetivo**

Remover duplicidades e código legado depois da estabilização.

**Onde mexer**

- `components/ui/**`
- `lib/utils.ts`
- `server.ts` da raiz antiga
- `app/api/**` do runtime antigo
- documentação final

**O que fazer**

1. Remover duplicatas de UI
2. Remover runtime legado antigo
3. Atualizar documentação oficial do projeto

**Como fazer sem quebrar**

- Só executar depois de uma janela real de estabilidade
- Confirmar que não há import residual

**Validação obrigatória**

- Typecheck limpo
- Build limpa
- Sem import quebrado

**Rollback**

Reverter apenas o cleanup, se necessário.

---

## 11. Plano de Rollout e Zero Downtime

## 11.1 Ordem correta de rollout

1. Staging da API nova
2. Staging da Web nova
3. Healthcheck da API nova
4. Smoke tests completos em staging
5. Publicação da API nova em produção, ainda sem corte do app
6. Publicação da Web nova em produção com rewrite pronto
7. Corte de tráfego
8. Ativação definitiva dos jobs novos
9. Monitoramento intensivo da primeira janela operacional

## 11.2 O que deve existir antes do corte

- Healthcheck da API novo funcionando
- Rewrite `/api` funcionando na Web nova
- Sessão funcionando em ambiente realista
- Jobs novos validados manualmente
- Socket autenticado validado
- Rollback ensaiado

## 11.3 Smoke test obrigatório no dia do corte

1. Login
2. Register
3. Logout
4. Auth/me
5. Catálogo
6. Criar pedido
7. Aceitar pedido
8. Despachar pedido
9. Gerar e validar OTP
10. Entregar pedido
11. Reconciliation
12. Zones
13. KPIs
14. Push subscription
15. Execução manual dos jobs

---

## 12. Plano de Rollback

## 12.1 Regra geral

Rollback precisa ser possível sem migration destrutiva adicional.

## 12.2 O que deve permanecer disponível até o fim da estabilização

- Monólito antigo
- Configuração antiga de deploy
- Banco compatível com os dois desenhos
- Possibilidade de desligar rewrites novos

## 12.3 Passos de rollback

1. Desativar a Web nova ou remover rewrite
2. Reapontar tráfego para o runtime anterior
3. Desligar jobs novos se houver risco de duplicidade
4. Validar auth, pedidos e reconciliação no desenho anterior

---

## 13. Matriz de Validação por Fase

| Fase | Validação mínima | Bloqueia avanço? |
|---|---|---|
| Workspace | Build local e lint | Sim |
| Shared | Typecheck e contratos intactos | Sim |
| API bootstrap | Health e readiness | Sim |
| Infra core | Prisma, Redis, JWT, socket bootstrap | Sim |
| Auth | login, logout, me, cookie | Sim |
| Orders core | ciclo crítico do pedido | Sim |
| Demais módulos | subscriptions, zones, kpis, notifications, webhook | Sim |
| Jobs | execução manual e cron externo | Sim |
| Web nova | navegação, PWA, build | Sim |
| Rewrite | `/api` estável | Sim |
| Realtime | eventos recebidos | Sim |
| Cutover | smoke test de produção | Sim |
| Cleanup | build limpa e documentação atualizada | Não para produção já estabilizada |

---

## 14. Riscos Conhecidos e Mitigações

## 14.1 Auth cross-subdomínio

**Risco**

Sessão não funcionar adequadamente entre Web e API.

**Mitigação**

- Testar em staging com subdomínios reais
- Definir corretamente domínio e política do cookie
- Manter `/api` por rewrite na Web

## 14.2 Socket autenticado

**Risco**

O código atual de `use-socket` tenta ler JWT por `document.cookie`, o que é incompatível com cookie httpOnly.

**Mitigação**

- Corrigir o handshake no PR específico de realtime
- Não misturar esse ajuste com auth base e com orders

## 14.3 Duplicidade de jobs

**Risco**

O job antigo e o job novo executarem ao mesmo tempo.

**Mitigação**

- Ativar apenas um scheduler por vez
- Ensaiar execução manual antes do cron

## 14.4 Service worker e contrato de API

**Risco**

O service worker atual assume `/api` na mesma origem.

**Mitigação**

- Preservar `/api` na Web via rewrite
- Validar o comportamento do cache no ambiente novo

## 14.5 Ícones da PWA

**Risco**

Há referências a ícones PNG na metadata e no manifest que precisam ser conferidas no rollout final.

**Mitigação**

- Validar a pasta `public/icons` antes do go-live
- Não considerar o PWA pronto sem essa checagem

---

## 15. O Que Não Fazer Durante a Execução

1. Não trocar framework do backend e arquitetura de deploy no mesmo PR de corte
2. Não remover o monólito antes da estabilização da nova Web e da nova API
3. Não misturar cleanup com mudança crítica de produção
4. Não alterar contratos compartilhados sem revisão explícita
5. Não ligar cron novo sem ter desligado o antigo
6. Não depender da Web para autorização real
7. Não reescrever todos os fetchs relativos se o rewrite resolve o problema com menos risco

---

## 16. Ordem Recomendada de Execução

Resumo objetivo:

1. PR 01 — Workspace
2. PR 02 — Shared
3. PR 03 — API bootstrap
4. PR 04 — Infra core
5. PR 05 — Auth
6. PR 06 — Orders core
7. PR 07 — Demais módulos
8. PR 08 — Jobs externos
9. PR 09 — Web nova
10. PR 10 — Rewrite `/api`
11. PR 11 — Realtime
12. PR 12 — Cutover
13. PR 13 — Cleanup

---

## 17. Critério de Sucesso da Migração

A migração será considerada bem-sucedida quando:

1. A Web estiver servida pela Vercel
2. A API estiver servida pelo Render
3. O navegador continuar consumindo `/api` sem regressões perceptíveis
4. O fluxo de pedidos estiver íntegro ponta a ponta
5. Socket, jobs e push estiverem funcionando
6. O monólito antigo puder ser removido com segurança

---

## 18. Observação Final

O desenho proposto neste documento é o mais equilibrado para o estado atual do Xuá Delivery.

Ele evita o erro de separar apenas pedaços do backend, preserva o contrato atual do navegador, reduz o risco de regressão no corte e mantém a complexidade operacional sob controle.

Se a execução seguir a ordem descrita aqui, com staging realista e disciplina de rollback, o split entre Web e API pode ser feito com risco controlado e sem ruptura desnecessária para o usuário final.