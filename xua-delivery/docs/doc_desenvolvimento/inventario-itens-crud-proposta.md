# Proposta — CRUD administrativo de itens de inventário

> Proposta técnica aprovada pelo arquiteto. Status: **NÃO implementado** (futuro). Registrada em 07/07/2026.

## Contexto

- `29_mst_inventory_items` só é alterada **manualmente no banco** — não existe endpoint de escrita para itens de inventário.
- `inventoryItemUpdateSchema` já existe em `packages/shared/src/schemas/inventory.ts` (com teste), mas nenhuma rota o consome.
- Desativação manual sem validação foi a **causa raiz do bug de jul/2026**: item desativado com saldo > 0 mantinha a linha de saldo visível (até o fix de 07/07/2026) e, após o fix, o saldo remanescente fica oculto nas listagens — o que a invariante abaixo passa a impedir.

## Escopo

- Rotas administrativas no módulo **ops**.
- Persistência **reutilizando o repositório do módulo inventory** — mesmo padrão já usado na leitura (`opsInventoryReadService.listItems → inventoryRepository.listInventoryItems`). **Sem duplicar repository.**

## Endpoints

| # | Endpoint | Regras |
|---|---|---|
| 1 | `POST /api/ops/inventory/items` | Cria item; body `inventoryItemCreateSchema`; `code` único (409); `product_id` obrigatório para `SELLABLE_PRODUCT`; `is_active` default `true`; RBAC ops; `emitEvent()` na mesma transação |
| 2 | `PATCH /api/ops/inventory/items/:id` | Atualização parcial via `inventoryItemUpdateSchema`. `code` e `type` **imutáveis após o item ter qualquer movimento** (rastreabilidade/semântica dos saldos event-sourced); `name`, `unit_label`, `low_stock_threshold`, `product_id` livres com auditoria; `is_active: true` (reativação) livre com auditoria; `is_active: false` segue as regras de desativação abaixo |
| 3 | *(sem DELETE)* | Item com movimento **jamais é removido** (integridade do event sourcing). Anti-objetivo: soft-delete paralelo a `is_active` |

## Regras de desativação (núcleo)

Invariante: **item inativo ⇒ saldo zero em todas as distribuidoras.**

1. `PATCH is_active: false` → service consulta os saldos do item em todas as distribuidoras.
2. Saldo ≠ 0 → rejeitar **409 `INVENTORY_ITEM_HAS_BALANCE`** com lista `{distributor_id, distributor_name, quantity_on_hand}` no corpo.
3. Zerar **sempre via fluxos de movimento existentes** (nunca UPDATE direto de saldo):
   - `LOSS_WRITE_OFF` (perda/descarte);
   - `MANUAL_CORRECTION` (correção justificada);
   - **transferência ao item substituto** — par de movimentos (saída do antigo + entrada do novo) na mesma transação, com `reference` comum e metadata `{origin: "ITEM_REPLACEMENT", replaced_item_id}`; recomendado endpoint dedicado `POST /api/ops/inventory/items/:id/migrate-balance` para atomicidade.
4. Com saldos zerados: `is_active = false` + `emitEvent()` na mesma transação.
5. Validações extras na desativação:
   - rejeitar se o item for o **único `RETURNABLE_EMPTY`/`RETURNABLE_FULL` ativo** — quebraria o settlement de caução (`findActiveReturnableEmptyItem`/`findActiveReturnableFullItem` retornariam `null`);
   - rejeitar se houver **sessão de reconciliação `OPEN`** referenciando o item.

## Migração segura (legado → invariante)

Antes de ativar a validação em produção, saneamento de **dados** (não de schema):

1. Diagnosticar itens `is_active = false` com saldo ≠ 0.
2. Operação decide o destino de cada saldo (perda / correção / transferência), executando via movimentos normais.
3. Só então a pré-condição dura entra em vigor.

Nenhuma migration Prisma nova; **não tocar** em migrations aplicadas nem em `18_aud_audit_events`.

## Fluxo operacional de substituição de item

```
criar item novo (POST)
        │
        ▼
migrar saldos (migrate-balance / movimentos)
        │
        ▼
desativar o antigo (PATCH is_active: false)
        │
        ▼
listagens mostram só o novo · extrato preserva o histórico · detalhe por id acessível para auditoria
```

## Não-objetivos

- Sem fila/worker (operação síncrona e rara).
- Sem cache Redis.
- Sem versionamento de API.

## Handoffs futuros

`xua-estoque-caucao` (regras de movimento/migração) → `xua-backend` (rotas/services) → `xua-frontend` (telas ops) → `xua-seguranca` (RBAC de escrita) → `xua-qualidade` → `xua-docs`.

## Referências

- Débito técnico registrado em `docs/doc_contexto/04-active-state.md` (§3, item 13).
- Fix relacionado (itens inativos nas listagens de saldo, 07/07/2026): `docs/doc_contexto/04-active-state.md` (§1, Caução e inventário).
- Schemas: `packages/shared/src/schemas/inventory.ts` · Repositório: `apps/api/src/modules/inventory/repository/inventory.repository.ts`.

---

**Última atualização: 07 de julho de 2026.**
