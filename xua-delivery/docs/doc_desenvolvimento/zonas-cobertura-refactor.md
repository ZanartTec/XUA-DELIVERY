# Reescrita do Módulo de Zonas de Atendimento

> **Status em 09/08/2026: código completo, migrations aplicadas com sucesso em desenvolvimento** (`prisma migrate deploy` contra o banco de DEV no Render). Sem pendência bloqueante conhecida.

## Contexto / problema resolvido

A tela `/ops/zones` era um CRUD raso (lista em cards + formulário inline) e carregava um bug crítico herdado: o schema Zod de cobertura (`packages/shared/src/schemas/zone.ts`) exigia CEP de **5 dígitos**, mas o banco grava e o cadastro de endereço do consumidor (`consumersService.createAddress`) busca cobertura pelo formato **`#####-###`** (8 dígitos, igual `02_mst_addresses.zip_code`). Toda linha de cobertura cadastrada pela API era dado morto: nunca casava com um endereço real, então a resolução de distribuidora por zona (`resolveDistributor()`, ver `doc_contexto/03-domain-data.md` §2.3) dependia inteiramente de bairro ou de seeds manuais.

Outros problemas presentes antes desta entrega:
- Nenhuma checagem de posse (`ownership`) nas rotas de escrita — um `distributor_admin` conseguia editar/apagar cobertura de zona de outra distribuidora.
- Zona desativada não podia ser reativada pela tela (só `DELETE`, sem `PATCH is_active: true` exposto de forma segura).
- Duas zonas ativas da mesma distribuidora podiam cobrir a mesma área sem aviso — `resolveCoveredZone` usava `LIMIT 1` sem `ORDER BY`, então o pedido caía numa zona aleatória entre as concorrentes.
- Sem caminho para mover uma zona (com toda a cobertura já cadastrada) de uma distribuidora para outra.
- Cobertura cadastrada linha a linha, sem import em massa — inviável para uma distribuidora com milhares de bairros/CEPs.

## Backend (`apps/api/src/modules/zones/`)

Módulo inteiro reescrito, mesmo padrão `routes → controller → service → repository` dos demais módulos.

### Rotas (`routes/zones.routes.ts`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/zones` | `consumer`, `distributor_admin`, `ops` | Array puro, só zonas ativas — shape legado do checkout, não alterado |
| `GET` | `/api/zones/all` | `distributor_admin`, `ops` | Painel ops: paginado, filtros `distributor_id`/`q` (nome)/`coverage` (bairro ou CEP)/`status` (`active`/`inactive`/`all`). `distributor_admin` tem `distributor_id` forçado à própria distribuidora mesmo se omitido |
| `GET` | `/:id/available-dates`, `/:id/time-slots` | públicas/JWT | Inalteradas |
| `POST` | `/api/zones` | `distributor_admin`, `ops` | Cria zona. Nome duplicado na mesma distribuidora → `DUPLICATE_ZONE_NAME` (409) |
| `PATCH` | `/api/zones/:id` | `distributor_admin`, `ops` | Edita `name`/`is_active`. **Não aceita `distributor_id`** — mover zona tem rota própria. Reativar recalcula conflito de cobertura |
| `DELETE` | `/api/zones/:id` | `distributor_admin`, `ops` | Soft delete (`is_active = false`) — zona nunca é hard-deletada |
| `PATCH` | `/api/zones/:id/transfer` | **só `ops`** | Move a zona para outra distribuidora |
| `GET` | `/api/zones/:id/coverage` | `distributor_admin`, `ops` | Cobertura paginada de UMA zona (`q`, `limit`, `offset`) |
| `POST` | `/api/zones/:id/coverage` | `distributor_admin`, `ops` | Adiciona 1 linha de cobertura |
| `POST` | `/api/zones/:id/coverage/bulk` | `distributor_admin`, `ops` | Import em massa (máx 500 linhas por chamada) |
| `POST` | `/api/zones/:id/coverage/preview` | `distributor_admin`, `ops` | Mesma validação do `bulk`, sem gravar — retorna `accepted`/`conflicts`/`warnings` |
| `DELETE` | `/api/zones/:id/coverage?coverageId=` | `distributor_admin`, `ops` | Remove 1 linha |

Ownership (`denyIfNotOwner` em `zones.controller.ts`): toda rota de escrita resolve o dono da zona (`resolveZoneOwner`) e, se o chamador for `distributor_admin`, compara com `distributorRepository.resolveDistributorId(req.user.sub)` — 403 se não bater. `ops` não tem essa restrição.

### Regras de negócio (`services/zones.service.ts`)

- **Normalização de CEP:** todo CEP de cobertura passa por `normalizeZipCode()` (`packages/shared/src/utils/zip.ts`) e vira `#####-###` antes de tocar o banco — mesmo formato usado por `resolveDistributor()`. Entrada inválida (≠ 8 dígitos) é rejeitada no schema Zod (`coverageSchema`).
- **Conflito interno (BLOQUEADO):** `detectInternalConflicts()` compara a nova cobertura contra linhas de outras zonas **ativas da mesma distribuidora** (chave = bairro normalizado sem acento/caixa via `normalizeNeighborhood()`, ou CEP exato). Se colidir, a linha é rejeitada — `COVERAGE_CONFLICT` (409) no `addCoverage` single, ou simplesmente excluída de `accepted` no `bulk`/`preview`.
- **Sobreposição externa (só AVISA):** depois de filtrar os conflitos internos, `findExternalOverlaps()` procura a mesma área em zonas de **outras** distribuidoras e devolve como `warnings` — não bloqueia, porque alimenta a escolha manual de distribuidora no checkout (`allows_consumer_choice`).
- **Reativação de zona:** `PATCH :id` com `is_active: true` numa zona antes inativa dispara `findSelfOverlapConflicts()` — a cobertura da zona pode ter ficado obsoleta (sobreposta por outra zona que nasceu enquanto ela estava desativada) e a reativação é recusada nesse caso.
- **Transferência (`transfer`):** exige (1) distribuidora de destino ativa, (2) **zero pedidos em aberto** na zona (`countOpenOrders`), (3) sem conflito de nome na distribuidora de destino, (4) sem conflito de cobertura entre a cobertura da zona e a cobertura já existente na distribuidora de destino (`findTransferConflicts`, calculado inteiramente no banco). Só então `zone.distributor_id` muda — e com ele, o roteamento de todo endereço já vinculado à zona.
- **Zona nunca hard-deletada:** `remove()` é sempre soft delete.
- **Cobertura nunca carregada inteira em memória:** toda checagem de conflito/sobreposição roda como query SQL filtrada (`findConflictingCoverage`, `findExternalOverlaps`, `findSelfOverlapConflicts`, `findTransferConflicts`) — o Node nunca recebe a cobertura completa de uma zona/distribuidora, só os eventuais conflitos. Necessário porque uma única zona pode ter milhares de linhas (caso real: Juiz de Fora).
- **Auditoria:** `ZONE_CREATED`, `ZONE_UPDATED` (inclui ativar/desativar), `ZONE_TRANSFERRED` (payload com `from_distributor_id`/`to_distributor_id`), `ZONE_COVERAGE_CHANGED` (payload com `action: 'added'|'removed'` e `count`). Todos emitidos na mesma transação Prisma da mutação (padrão `emitEvent()` do projeto).

### Erros de domínio (`ZoneServiceError`)

`ZONE_NOT_FOUND` (404), `DISTRIBUTOR_NOT_FOUND` (404), `DISTRIBUTOR_INACTIVE` (409), `DUPLICATE_ZONE_NAME` (409), `COVERAGE_CONFLICT` (409), `ZONE_HAS_OPEN_ORDERS` (409), `SAME_DISTRIBUTOR` (400).

## Zod schemas (`packages/shared/src/schemas/zone.ts`)

- `zoneSchema` / `zoneUpdateSchema` (sem `distributor_id` — transferência é endpoint à parte) / `zoneTransferSchema`.
- `zoneOpsQuerySchema` — filtros do painel (`distributor_id`, `q`, `coverage`, `status`, `limit` até 100, `offset`), todos aplicados no banco.
- `zoneCoverageQuerySchema` — paginação da cobertura de uma zona.
- `coverageSchema` — exige bairro OU CEP; CEP passa por `normalizeZipCode()` dentro do próprio schema (`.transform()`), rejeitando qualquer coisa que não normalize para 8 dígitos.
- `coverageBulkSchema` — array de `coverageSchema`, 1 a 500 itens.

Novo utilitário compartilhado `packages/shared/src/utils/zip.ts`:
- `normalizeZipCode(raw): string | null` — fonte única da verdade do formato de CEP persistido (`#####-###`), usada tanto no schema Zod quanto (via `normalizeNeighborhood`) nas comparações do service.
- `normalizeNeighborhood(raw): string` — minúsculas, sem acento, sem espaço duplo; só para comparação, o valor original é o que fica gravado.

## Banco de dados

Duas migrations, ambas **já aplicadas em desenvolvimento** (Render):

1. **`20260809120000_zone_coverage_integrity`**
   - 4 novos valores em `audit_event_type`: `ZONE_CREATED`, `ZONE_UPDATED`, `ZONE_TRANSFERRED`, `ZONE_COVERAGE_CHANGED`.
   - CEPs com formato legado de 5 dígitos em `05_mst_zone_coverage.zip_code` viram `NULL` (não dá para inferir os 3 dígitos finais; o bairro da mesma linha continua valendo).
   - Linhas sem bairro E sem CEP são removidas (não cobrem nada).
   - Duplicatas exatas dentro da mesma zona são removidas.
   - Índice único defensivo `(zone_id, neighborhood, zip_code)` — rede de segurança contra duplicata exata; a regra real de não-sobreposição entre zonas diferentes vive no service, porque o banco não expressa uma comparação que atravessa linhas de tabelas diferentes.

2. **`20260809130000_zone_coverage_scale`** — hardening pensado para dezenas de distribuidoras, cada uma podendo ter milhares de linhas de cobertura:
   - Extensão `pg_trgm` + índices GIN trigram em `04_mst_zones.name` e `05_mst_zone_coverage.neighborhood`/`zip_code`, para busca por substring (`ILIKE '%x%'`) sem full scan.
   - Função `immutable_unaccent(text)` — wrapper `IMMUTABLE` sobre `unaccent()` (que é `STABLE` e não pode indexar), padrão documentado do Postgres para permitir índice funcional acento-insensível.
   - Função `normalize_neighborhood(text)` — mesma normalização de `normalizeNeighborhood()` do lado JS (minúsculas, sem acento, espaços colapsados), para a comparação exata de conflito bater dos dois lados.
   - Coluna `05_mst_zone_coverage.distributor_id` (`NOT NULL`, FK para `03_mst_distributors`, backfillada a partir de `zone.distributor_id`) — denormalizada para a checagem de conflito interno filtrar direto por índice, sem `JOIN` com `04_mst_zones`, mantida em sincronia pela aplicação (criação de cobertura e transferência de zona).

## Frontend (`apps/web/`)

`app/(ops)/ops/zones/page.tsx` reescrito como painel **master-detail**: `DistributorPicker` (distribuidora específica ou "Todas", força o próprio `distributor_id` quando o filtro global não é permitido) à esquerda, `ZoneTable` com filtros/paginação à direita. No desktop as duas colunas convivem; no mobile viram dois passos sequenciais (o shell `(ops)` é bottom-nav mobile-first).

Componentes novos em `src/components/ops/zones/`:
- `distributor-picker.tsx` — seletor de distribuidora, inclui opção "Todas" (`ALL_DISTRIBUTORS`).
- `zone-table.tsx` / `zone-row.tsx` / `zone-filters.tsx` — tabela paginada com filtro por nome/cobertura/status.
- `zone-form.tsx` — criar/editar zona (nome + status).
- `coverage-editor.tsx` — cobertura de uma zona: busca paginada + import em massa (cola uma lista de bairros/CEPs, valida com `POST .../coverage/preview` antes de gravar com `POST .../coverage/bulk`).
- `zone-transfer-dialog.tsx` — transferência de zona entre distribuidoras (só visível para `ops`).
- `zone-deactivate-dialog.tsx` — confirma desativação mostrando quantos endereços cadastrados ficam na zona (`affected_addresses`, devolvido por `PATCH :id`).
- `styles.ts` — classes Tailwind compartilhadas do painel.

Novo hook `src/hooks/ops/use-ops-zones.ts` — usa TanStack Query (`useQuery`/`useMutation`) para distribuidoras, zonas e cobertura. **Primeira tela da área `(ops)` a usar `useMutation`** — as demais telas ops (banners, produtos, planos de assinatura) seguem com fetch cru + revalidação manual; convenção a observar em telas ops futuras.

Novo utilitário `src/lib/zone-coverage.ts` — parser da lista colada no import em massa (separa por linha, tenta reconhecer bairro vs. CEP).

## Testes

Cobertura Vitest em `apps/api/src/modules/zones/{controllers,services}/*.test.ts` e `packages/shared/src/schemas/zone.test.ts` (mock do Prisma, sem banco real): normalização de CEP de 8 dígitos em vários formatos de entrada, rejeição de CEP de 5 dígitos, bloqueio de conflito interno, aviso (não bloqueio) de sobreposição externa, ownership em rotas de escrita (`distributor_admin` de uma distribuidora não mexe em zona de outra), transferência bloqueada com pedido em aberto, transferência bloqueada por conflito de cobertura no destino, reativação de zona recusada por conflito.

## Referências cruzadas

- Schema, rotas e regras de negócio: `docs/doc_contexto/03-domain-data.md` (§1.1 tabelas `04_mst_zones`/`05_mst_zone_coverage`, §2.6 regras de zonas, §3 eventos de auditoria, §4 mapa de rotas, §5 rotas web).
- Estado do projeto: `docs/doc_contexto/04-active-state.md` (seção "Zonas de atendimento" em §1).
- Detalhe tabela a tabela: `docs/doc_sistema/banco-de-dados.md` (`04_mst_zones`, `05_mst_zone_coverage`).
- Fluxo de tela: `docs/doc_sistema/fluxo-usuarios.md` (Fluxo 4 — Operações e Suporte).
- Arquitetura/stack: `docs/doc_contexto/02-tech-stack.md`, `docs/doc_sistema/guia-tecnico.md`.

---

**Última atualização: 09 de agosto de 2026.**
