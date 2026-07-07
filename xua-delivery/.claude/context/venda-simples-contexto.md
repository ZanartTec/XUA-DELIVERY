# Contexto Vivo — Venda Simples (sem caução)

> Estado atual da execução. Atualizar ao fim de cada fase do plano
> (`.claude/plans/venda-simples-plano-implementacao.md`).
> Design: `.claude/architecture/venda-simples-arquitetura.md`.
> Demanda de origem: `docs/Doc_sistema/CONTEXTO-DEMANDA-ATUAL.md` (reunião Chuá jul/2026).

## Status geral

**Fase atual:** código pronto (Fases 1 e 2); falta rodar o seed no banco e o e2e manual.
Branch: `feature/venda-simples-sem-caucao`.

| Fase | Status | Observação |
|---|---|---|
| 1 — Catálogo e dados | seed pronto; **EXECUÇÃO PENDENTE** | rodar `npx tsx prisma/seed-venda-simples.ts` com DATABASE_URL (bloqueado por permissão na sessão) |
| 2 — Front consumidor | CONCLUÍDA | typecheck+lint ok; validação visual pendente do seed |
| 3 — Assinaturas | DISPENSADA (banco novo sem assinaturas) | — |
| 4 — Validação e2e | parcial | check-enums ok; e2e manual pendente do seed |

Arquivos alterados (Fase 2): `cart/page.tsx`, `checkout/payment/page.tsx`,
`checkout/schedule/page.tsx`, `orders/[id]/page.tsx` (consumer), `role-app-shell.tsx`.
Novo: `prisma/seed-venda-simples.ts`.

Ajustes pós-teste do Matheus (commit `1bb3729`): card do catálogo corrigido —
imagem `object-contain` (sem corte do garrafão), descrição completa (sem line-clamp),
e removido o desconto FAKE hardcoded (`price*1.27` riscado p/ produtos < R$20, por isso
só a água de R$12 mostrava desconto).

Resolvido (commit `f155843`): cards do catálogo nivelados (flex + mt-auto no rodapé);
form de produto da ops sem os campos legados (Tipo, Vasilhame vinculado, Depósito
legado) — produto novo nasce `kind=OTHER`, edição preserva o kind, backend segue
aceitando os campos (base do Comodato B2B).

## Decisões já tomadas (não rediscutir sem motivo novo)

1. **Não remover** código/tabelas de caução — desligamento por DADOS (produtos sem
   `bottle_product_id`). Infra vira base do Comodato B2B futuro.
2. 2 produtos manuais, ambos `kind=OTHER`, vendáveis normais, sem vínculo água↔galão.
   R$ 12 (água, troca implícita) e R$ 37 (água + galão definitivo).
3. `kind=OTHER` **passa no aceite** do distribuidor — verificado: aceite não olha kind,
   só exige 1 InventoryItem ativo vinculado (armadilha antiga era o tipo do InventoryItem,
   já corrigida em `inventory.repository.ts:224` p/ aceitar os 3 tipos vendáveis).
4. Produtos antigos: desativar, nunca editar/deletar.
5. `recordBottleExchange`/`non-collection` do driver PERMANECEM (operação física, não caução).
6. Não existe worker BullMQ de caução — nada a desligar na fila.
7. Assinaturas: banco novo NÃO tem assinaturas (confirmado 2026-07-06) — nada a repontar
   agora. Regra futura: todo `SubscriptionPlan` deve apontar p/ produto sem
   `bottle_product_id` (geração não passa pelo createOrder nem checa is_active).

## Pendências externas (cliente)

- Regra comercial de cobrança na porta (galão danificado/ausente) — Jean.
- Imagens definitivas dos 2 produtos.
- Texto final dos avisos de vasilhame (usar placeholder aprovável na Fase 2).

## Aprendizados / armadilhas do ambiente

- Typecheck da API tem erros pré-existentes (resend, passwordResetToken) — não confundir
  com regressão. Vitest ausente no ambiente local.
- Banco prod (Render, db `xua`) usa `RETURNABLE_FULL`/`RETURNABLE_EMPTY` vinculados a produtos;
  aceite já foi quebrado uma vez por filtro de tipo de item de estoque (commit `01754e9`).
- Conferir `prisma migrate deploy` (migrations da caução) antes da Fase 1 em cada ambiente.
