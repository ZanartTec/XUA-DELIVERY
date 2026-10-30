# Testes

Todos os testes automatizados do backend vivem aqui. `apps/api/src` e
`packages/shared/src` contêm só código de produção — nenhum `*.test.ts`.

## Estrutura

```
tests/
├── aliases.ts          fonte única dos aliases (importada pelas duas configs do Vitest)
├── tsconfig.json       typecheck dos testes (npm run typecheck:tests)
├── support/            helpers compartilhados — não são testes
│   ├── error-next.ts           next() que roda o errorHandler real
│   ├── fixtures.ts             fábricas de dados (integração)
│   └── prisma-test-client.ts   reset do banco entre testes
├── unit/               Prisma e Redis mockados; roda em qualquer máquina
│   ├── api/            espelha apps/api/src/
│   └── shared/         espelha packages/shared/src/
├── integration/        Postgres real, sem mock de Prisma
│   └── api/            espelha apps/api/src/
└── e2e/                Playwright — navegador contra um stack de pé
    ├── playwright.config.ts
    └── smoke.spec.ts
```

O e2e roda com Playwright, não com Vitest, e não usa os aliases acima: ele
conversa com a aplicação por HTTP (`E2E_BASE_URL`), sem importar código do
`src`. A dependência `@playwright/test` continua declarada em `apps/web`, que
é de onde o comando é disparado.

`unit/` e `integration/` **espelham a árvore do `src`**. O teste de
`apps/api/src/modules/orders/services/checkout.service.ts` fica em
`tests/unit/api/modules/orders/services/checkout.service.test.ts`. Isso torna
mecânico achar o teste de um arquivo — e enxergar o que não tem cobertura.

## Aliases

Testes **não** usam caminho relativo para alcançar o código. Com a separação,
um import relativo viraria `../../../../../apps/api/src/...` e quebraria a cada
arquivo movido de lugar.

| Alias | Aponta para |
|---|---|
| `@api/*` | `apps/api/src/*` |
| `@xua/shared`, `@xua/shared/*` | `packages/shared/src/*` |
| `@tests/*` | `tests/*` |

```ts
import { checkoutService } from "@api/modules/orders/services/checkout.service.js";
import { errorForwardingNext } from "@tests/support/error-next.js";

vi.mock("@api/modules/zones/repository/zones.repository.js", () => ({ ... }));
```

Os aliases estão declarados em dois lugares que precisam andar juntos:
`tests/aliases.ts` (runtime do Vitest) e `tests/tsconfig.json` (`paths`, para o
editor e o typecheck). Ao mexer em um, mexa no outro.

O sufixo `.js` nos imports segue a convenção do `src` — o Vitest e o `tsc`
resolvem para o `.ts` correspondente.

## Comandos

```bash
npm test                  # unit (tests/unit/**), Prisma e Redis mockados
npm run test:watch
npm run test:coverage     # cobertura medida sobre src/, não sobre tests/
npm run test:integration  # exige Postgres — docker compose up -d
npm run typecheck:tests   # erro de tipo em teste não passa batido
npm run test:e2e          # Playwright — exige web + api já rodando
```

## Escrevendo um teste novo

1. Crie o arquivo no caminho que **espelha** o do código, sob `unit/` ou
   `integration/`.
2. Importe por alias, nunca por caminho relativo.
3. Em teste de controller, use `errorForwardingNext` de `@tests/support`: os
   controllers repassam erro para `next()` e quem traduz code → status é o
   `errorHandler` (ver `apps/api/src/errors/index.ts`).
4. Dublê de erro de domínio precisa estender `AppError` — herdar de `Error`
   puro faz o `errorHandler` devolver 500 em vez do status real.
5. Ao mockar `@api/infra/logger/index.js`, exporte **`logger` e `createLogger`**:
   o `errorHandler` usa `logger`, e uma fábrica incompleta derruba o
   middleware com TypeError travestido de 500.

## Cobertura

Módulos ainda sem nenhum teste: `banners`, `categories`, `consumers`,
`notifications`, `audit`. As pastas vazias na árvore são o mapa dessa dívida.
