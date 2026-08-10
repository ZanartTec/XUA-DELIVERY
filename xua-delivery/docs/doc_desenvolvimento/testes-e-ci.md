# Testes e CI/CD

## Estrutura de testes

Os testes ficam **ao lado do código** (`arquivo.ts` + `arquivo.test.ts` no mesmo
diretório) — não há pasta `__tests__` separada. Essa convenção já era seguida
pelos 44 testes existentes e continua sendo o padrão: facilita achar o teste de
um arquivo e evita a estrutura de pastas divergir do código real.

Duas camadas, diferenciadas por sufixo:

| Sufixo | O que é | Roda contra | Config |
|---|---|---|---|
| `*.test.ts` | Unitário — Prisma/Redis mockados (`vi.mock`), sem I/O real | Nada (mock total) | `vitest.config.ts` |
| `*.integration.test.ts` | Integração — bate no Postgres de verdade | Postgres real (local ou CI) | `vitest.integration.config.ts` |

Reserve `.integration.test.ts` para lógica que só existe no banco e que um mock
não consegue exercitar: `$queryRaw`, triggers, constraints, funções SQL
(`normalize_neighborhood`, `unaccent`). Ex.: `zones.repository.integration.test.ts`
cobre o trigger `trg_05_mst_zone_coverage_sync_distributor_id` (migration
`20260809140000`) — um teste unitário com Prisma mockado nunca pegaria uma
regressão nesse trigger, porque o mock não roda SQL de verdade.

Para a maioria dos módulos, o teste unitário com mock já é suficiente e mais
rápido — não crie `.integration.test.ts` por padrão, só quando o comportamento
realmente depender do banco.

### E2E (Playwright) — fase 2, ainda scaffold

`apps/web/e2e/` tem um único smoke test (`smoke.spec.ts`): login como
consumer + chegada no `/catalog`. Não substitui unit/integration para regra de
negócio — é só a garantia de que o caminho mais básico não está quebrado.
Roda no CI como job informativo (`e2e-smoke`, `continue-on-error: true`), não
bloqueia merge ainda. Adicione mais fluxos (checkout completo, aceite do
distribuidor, entrega + OTP) antes de promovê-lo a required check.

## Rodando localmente

```bash
# Unitário — rápido, sem banco
npm test
npm run test:watch
npm run test:coverage

# Integração — precisa de Postgres rodando
docker compose up -d postgres
# crie o banco de teste uma vez: docker exec xua-postgres psql -U xua -d xua_delivery -c "CREATE DATABASE xua_test;"
DATABASE_URL="postgresql://xua:xua_secret_change_me@localhost:5432/xua_test" npx prisma migrate deploy
DATABASE_URL="postgresql://xua:xua_secret_change_me@localhost:5432/xua_test" npm run test:integration

# E2E — precisa de API e Web já rodando (ver aviso abaixo)
npm run test:e2e -w @xua/web  # ou: npm run test:e2e
```

**Cuidado ao subir API/Web localmente para testar manualmente ou rodar E2E**:
`apps/api/.env` tem `DATABASE_URL`/`REDIS_URL` de produção (comentado o par
local do docker-compose) e `apps/web/.env.production` tem `API_URL`,
`JWT_SECRET` e `INTERNAL_SECRET` **reais de produção** — carregados
automaticamente sempre que você roda `npm run build:web && npm run start:web`
(modo produção). Isso foi confirmado durante a validação desta pipeline: rodar
`next build`/`next start` sem sobrescrever `API_URL`/`NEXT_PUBLIC_API_URL`/
`JWT_SECRET`/`INTERNAL_SECRET` explicitamente faz o front falar com a API de
produção de verdade. Para testar contra o banco local, sempre exporte essas
variáveis explicitamente antes (é isso que o job `e2e-smoke` do CI faz, com
segredos fabricados só para o job — nunca herda esses arquivos `.env`).

## O que roda no CI (`.github/workflows/ci.yml`)

Todo PR (e push em `main`) dispara, em paralelo:

- **`typecheck`** (bloqueante) — `tsc --noEmit` em api/web/shared + `prisma validate`. Hoje 100% verde.
- **`lint`** (informativo, `continue-on-error`) — `apps/web` tem 16 erros de
  ESLint pré-existentes (`react-hooks/set-state-in-effect` em `use-socket.ts`,
  `use-distributor-payment-methods.ts` e outros hooks), sem relação com este
  trabalho de CI. Promova para bloqueante depois de zerar esse débito.
- **`unit-tests`** (bloqueante) — os `*.test.ts`, com coverage.
- **`integration-tests`** (bloqueante, só roda se o PR tocar `apps/api/**`,
  `packages/shared/**` ou `prisma/**`) — sobe Postgres efêmero, roda
  `prisma migrate deploy` (valida a cadeia de migrations do zero) e os
  `*.integration.test.ts`.
- **`build`** (bloqueante) — `next build` + `prisma generate`.
- **`e2e-smoke`** (informativo, só roda se o PR tocar `apps/api/**` ou
  `apps/web/**`) — stack completo (Postgres + Redis efêmeros, seed, API, web)
  com segredos fabricados só para o job.

Nenhum job herda `DATABASE_URL`/`REDIS_URL`/segredos de produção — cada job
que precisa de banco/redis sobe seu próprio serviço efêmero do zero.

### O que NÃO roda no CI (fica pro deploy)

- `prisma migrate deploy` **real** contra produção — só no `buildCommand` do
  Render (`render.yaml`).
- Seeds de produção (`prisma/production/*.sql`).
- Qualquer coisa que use os `.env`/`.env.production` reais.

## Configurando o branch protection (main)

Depois que o workflow tiver rodado pelo menos uma vez em algum PR (o GitHub só
lista como opção os status checks que já rodaram):

1. GitHub → **Settings → Branches → Branch protection rules** → adicionar
   regra para `main`.
2. Marcar **"Require status checks to pass before merging"**.
3. Selecionar: `typecheck`, `unit-tests`, `build`.
4. **Não** marcar `integration-tests` como required — ele é path-filtered
   (pulado em PRs que não tocam API/banco), e o GitHub trata job pulado como
   "sem status", o que travaria o merge de qualquer PR que só mexesse no
   frontend. Mesma lógica para `lint` e `e2e-smoke` — ainda informativos.
5. (Opcional) marcar "Require branches to be up to date before merging".

## Evitando pipeline lenta

- `integration-tests` e `e2e-smoke` são path-filtered — só pagam o custo de
  subir Postgres/Redis/browser quando o PR realmente toca o código relevante.
- `concurrency` cancela runs antigos do mesmo PR quando um push novo chega.
- `typecheck`, `lint`, `unit-tests` e `build` rodam em paralelo, não em série.
- Cache de `npm ci` via `actions/setup-node` (`cache: npm`).
