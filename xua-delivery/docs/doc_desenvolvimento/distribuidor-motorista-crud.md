# CRUD de Distribuidor e Motorista (fim do cadastro via SQL manual)

> **Status em 02/08/2026: código completo (schema + backend + frontend), migration gerada mas NÃO aplicada em nenhum banco.** Aguardando o usuário fornecer as credenciais do banco de DEV para aplicar `20260802130000_add_consumer_is_active_and_management_audit_events` e validar ponta a ponta. Até lá, a feature não pode ser exercitada em ambiente real.

## Contexto / problema resolvido

Não existia nenhum caminho de aplicação para cadastrar uma nova distribuidora, cadastrar um motorista, vincular motorista↔distribuidora ou desativar qualquer um dos dois. A evidência do estado anterior está em produção: `prisma/production/seed_distributor_sao_luiz_jf_users.sql` cria o admin da distribuidora "São Luiz" via `INSERT` SQL manual, com hash de senha reciclado entre contas, sem hashing controlado pela aplicação e sem auditoria. O código já antecipava o problema (query `orphanDrivers`/`findDriversByDistributor` em `distributor.repository.ts`), mas não havia ferramenta de aplicação para resolvê-lo.

Esta entrega dá a `ops` e `distributor_admin` um CRUD real, dentro do módulo `distributor` já existente — sem novo módulo, sem fila, sem socket.

## Schema (`prisma/schema.prisma`)

- `Consumer.is_active Boolean @default(true)` — permite desativar motorista/admin de distribuidora sem apagar o registro. Default `true` preserva o comportamento de todas as contas existentes.
- `AuditEventType` ganhou 5 valores: `DISTRIBUTOR_CREATED`, `DISTRIBUTOR_UPDATED`, `DRIVER_CREATED`, `DRIVER_UPDATED`, `DRIVER_LINKED_TO_DISTRIBUTOR` (total do enum: 39 tipos, era 34). Sincronizados manualmente em `packages/shared/src/enums/index.ts` (o projeto não gera esse arquivo a partir do Prisma).
- Migration gerada em `prisma/migrations/20260802130000_add_consumer_is_active_and_management_audit_events/migration.sql` — **arquivo commitado, não aplicado**. `ALTER TABLE ... ADD COLUMN is_active` + 5x `ALTER TYPE audit_event_type ADD VALUE` (aditivo, retrocompatível).

## Backend (`apps/api/src/modules/distributor/`)

Novos endpoints, todos no módulo `distributor` (padrão `routes → controller → service → repository`, mesmo do módulo `zones`):

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/api/distributor` | `ops` | Cria distribuidora + primeiro admin (`ConsumerRole.DISTRIBUTOR_ADMIN`) numa transação única. `P2002` (CNPJ/e-mail duplicado) → `DistributorServiceError("DUPLICATE_DISTRIBUTOR")` → HTTP 409 |
| `PATCH` | `/api/distributor/:id` | `ops` | Edita distribuidora, incluindo `is_active` |
| `POST` | `/api/distributor/drivers` | `distributor_admin`, `ops` | Cria motorista. `distributor_admin` só cria para a própria distribuidora — `distributor_id` é resolvido do token (`resolveDistributorId`) e qualquer valor enviado no body é ignorado; `ops` deve informar `distributor_id` no body (senão `DISTRIBUTOR_ID_REQUIRED` → 400) |
| `PATCH` | `/api/distributor/drivers/:id` | `distributor_admin`, `ops` | Edita motorista, incluindo `is_active`. `distributor_admin` só edita motorista da própria distribuidora — `DRIVER_NOT_OWNED_BY_DISTRIBUTOR` → 403 se tentar editar de outra |
| `GET` | `/api/distributor/drivers/unlinked` | `ops` | Lista motoristas órfãos (`Consumer.role = DRIVER`, `distributor_id = null`) |
| `PATCH` | `/api/distributor/drivers/:id/link` | `ops` | Vincula motorista órfão a uma distribuidora |

Outras mudanças no mesmo módulo:

- `GET /api/distributor/all` passou a chamar `distributorRepository.findAllForOps()` (novo método) em vez de `findAllActive()` — retorna TODAS as distribuidoras (ativas e inativas) com campos completos (`cnpj`, `phone`, `email`, `acceptance_sla_seconds`, `allows_consumer_choice`, `is_active`). Antes devolvia só `{id, name, mp_connected}` de distribuidoras ativas. `findAllActive()` foi mantido intocado — ainda usado por `ops/kpi.controller.ts` para métricas.
- `apps/api/src/modules/auth/services/auth.service.ts` — `login` agora rejeita com `AuthServiceError("Conta desativada", 403)` quando `consumer.is_active === false`. Sem essa checagem o campo `is_active` não teria efeito nenhum.
- Desativar um motorista/admin (`is_active: false` via `PATCH .../drivers/:id`) invalida imediatamente qualquer JWT já emitido para ele: `markAccountDeactivated()`, novo export de `apps/api/src/infra/auth/password-change.ts`, reaproveitando o mesmo mecanismo Redis de `markPasswordChanged()` (usado hoje no fluxo de "esqueci minha senha").

**Erros de negócio novos** (`DistributorServiceError`): `DUPLICATE_DISTRIBUTOR` (409), `DUPLICATE_DRIVER_EMAIL` (409), `DISTRIBUTOR_ID_REQUIRED` (400), `DRIVER_NOT_FOUND` (404), `DRIVER_NOT_OWNED_BY_DISTRIBUTOR` (403).

## Zod schemas (`packages/shared/src/schemas/`)

- `distributor.ts`: `distributorCreateSchema` (dados da distribuidora + do primeiro admin: `admin_name`, `admin_email`, `admin_phone`, `admin_password`), `distributorUpdateSchema` (`.partial()`, inclui `is_active`). `distributorQuerySchema` existente mantido intacto.
- `driver.ts` (novo arquivo): `driverCreateSchema` (`name`, `email`, `phone` opcional, `password` min 8, `distributor_id` opcional — obrigatoriedade condicional é resolvida no service, não no schema) e `driverUpdateSchema` (`.partial()`: `name`, `phone`, `is_active`).

## Frontend (`apps/web/app/`)

Mesmo padrão visual de `ops/banners` e `ops/subscription-plans` (formulário inline + lista em cards, sem componente de tabela novo, sem modal):

- `(ops)/ops/distributors/page.tsx` (novo) — CRUD de distribuidoras: lista via `GET /api/distributor/all`, cria via `POST /api/distributor`, edita inline via `PATCH /api/distributor/:id` (inclui toggle `is_active`).
- `(ops)/ops/drivers/page.tsx` (novo) — visão global de motoristas para `ops`, com destaque para órfãos (`GET /api/distributor/drivers/unlinked`) e ação de vincular (`PATCH /api/distributor/drivers/:id/link`).
- `(distributor)/distributor/drivers/page.tsx` (novo) — o `distributor_admin` cadastra/edita/desativa os motoristas da própria distribuidora (`POST`/`PATCH /api/distributor/drivers`).
- `(ops)/ops/zones/page.tsx` (editada) — antes só leitura, agora com criação de zona (`POST /api/zones`) e gestão de cobertura por CEP/bairro (`POST`/`DELETE /api/zones/:id/coverage`). O backend de zonas já existia 100%; só faltava a tela.
- `src/components/shared/role-app-shell.tsx` — item "Zonas" reativado (estava comentado) no menu `ops`; "Distribuidoras" e "Motoristas" adicionados ao menu `ops`; "Motoristas" adicionado ao menu `distributor_admin`.

Nenhuma mudança em `apps/web/proxy.ts` — as novas rotas caem sob `/ops/...` e `/distributor/...`, já liberadas no `ROLE_ROUTES` existente.

## Testes

Cobertura Vitest (mock do Prisma via `vi.hoisted`/`vi.mock`, sem banco real) em `apps/api/src/modules/distributor/{repository,services}/*.test.ts`: criação de distribuidora+admin em transação única, rejeição de CNPJ/e-mail duplicado, criação de motorista por `distributor_admin` (ignorando `distributor_id` do body), edição de motorista de outra distribuidora (deve falhar com 403), vinculação de motorista órfão, bloqueio de login por `is_active=false`.

## O que falta (bloqueado até o usuário fornecer credenciais de DEV)

1. Aplicar a migration `20260802130000_add_consumer_is_active_and_management_audit_events` em DEV.
2. Confirmar que `Consumer.is_active` vem `true` por padrão nos registros existentes.
3. Smoke test ponta a ponta: criar distribuidora com admin → login do admin; cadastrar motorista pelo `distributor_admin` → aparece no dropdown de despacho; desativar motorista → login bloqueado (403) e sessão já aberta invalidada; localizar e vincular motorista órfão como `ops`; criar zona nova + cobertura por CEP.
4. Só depois de validado em DEV, avaliar com o usuário a promoção para produção (migration em produção é ação sensível, exige confirmação explícita separada).

## Recomendação sobre os seeds SQL legados

`prisma/production/seed_distributor_sao_luiz_jf.sql` e `prisma/production/seed_distributor_sao_luiz_jf_users.sql` **devem passar a ser tratados como fallback de emergência / disaster-recovery, não mais como fluxo padrão de onboarding de parceiros** — o CRUD acima é o caminho oficial a partir desta entrega.

**Atenção — PII real:** `seed_distributor_sao_luiz_jf_users.sql` contém dados de conta reais (e-mail, hash de senha reciclado entre contas) de um parceiro em produção. Os arquivos não foram removidos nem alterados nesta entrega — essa é apenas uma recomendação documentada; a decisão de arquivar/expurgar/restringir acesso a esses arquivos (e se algum hash de senha precisa ser rotacionado por ter sido reciclado) cabe ao usuário e ao agente `xua-seguranca`.

## Referências cruzadas

- Schema e rotas: `docs/doc_contexto/03-domain-data.md` (§1.1 tabela `01_mst_consumers`, §3 eventos de auditoria, §4 mapa de rotas, §5 rotas web).
- Estado do projeto e débito técnico: `docs/doc_contexto/04-active-state.md`.
- Detalhe tabela a tabela: `docs/Doc_sistema/banco-de-dados.md`.
- Plano de implementação original: `C:\Users\Matheus\.claude\plans\curried-imagining-cerf.md` (fora da árvore do repositório).

---

**Última atualização: 02 de agosto de 2026.**
