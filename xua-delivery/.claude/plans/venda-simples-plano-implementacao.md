# Plano de Implementação — Venda Simples (sem caução)

> Checklist de execução. A **fonte da verdade** do design é
> `.claude/architecture/venda-simples-arquitetura.md`. Aqui está apenas **como** executar.
>
> Marcação: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.
> Ao fim de cada fase, atualizar `.claude/context/venda-simples-contexto.md`.

---

## Estratégia geral

3 fases ativas, **commits separados por fase**. Nenhuma migration — o desligamento é por dados.
Fase 1 (dados) é pré-requisito das demais e reversível a qualquer momento.
Fase 2 (front) só entrega valor visível completo após Fase 1 aplicada no ambiente.
Fase 3 (assinaturas) foi DISPENSADA — banco novo sem assinaturas (ver seção da fase).
Fase 4 é validação e2e formal.

Branch sugerida: `feature/venda-simples-sem-caucao` a partir da `develop`.

---

## FASE 1 — Catálogo e dados (sem código, ou seed/script)

**Objetivo:** existirem os 2 produtos vendáveis simples com estoque vinculado, e os
produtos antigos fora do ar.

### Tarefas
- [~] **T1.1–T1.5** Implementadas em `prisma/seed-venda-simples.ts` (2026-07-06): cria os 2
      produtos (OTHER, sem vínculo), garante 1 InventoryItem ativo por produto (desativa
      excedentes), desativa produtos antigos (WATER vinculado + BOTTLE), REPORTA saldos
      residuais (`bottles_on_loan > 0`) sem zerar, cria saldos de estoque só se não existirem
      (`SEED_STOCK_QTY`, default 100), e valida a invariante final (0 produtos ativos vinculados).
      **EXECUÇÃO PENDENTE** — rodar manualmente (execução contra o banco foi bloqueada por
      permissão na sessão):
      `$env:DATABASE_URL="<url do apps/api/.env>"; npx tsx prisma/seed-venda-simples.ts`
- [x] **T1.6** Seed idempotente criado (typecheck ok).

### Validação da fase
- Catálogo público (`GET /api/products`) retorna exatamente os 2 produtos novos. (pendente — após rodar o seed)
- Query manual: nenhum produto ativo com `bottle_product_id != null`. (o próprio seed verifica e falha se violar)

---

## FASE 2 — Front consumidor (limpeza + UX da reunião)

**Objetivo:** carrinho/checkout sem qualquer vestígio de caução + ajustes pedidos pelo cliente.

### Tarefas — CONCLUÍDAS 2026-07-06
- [x] **T2.1** `cart/page.tsx`: steppers e texto de caução removidos; substituídos por card
      informativo "Troca de vasilhame" (aviso de troca + cobrança se danificado).
- [x] **T2.2** `checkout/payment/page.tsx`: `empty_bottles` removido do POST /orders e do
      preview; chamada a `/deposit/preview` e estado `settlement` removidos; total = subtotal.
      Cart store mantido intacto (quiescente).
- [x] **T2.3** Avisos textuais: card no cart + aviso na tela de pagamento antes do botão
      de confirmar (placeholder aprovável — validar texto final com o cliente).
- [x] **T2.4** Botão voltar do agendamento: `h-9 w-9`→`h-12 w-12`, ícone `h-7 w-7`
      `strokeWidth 2.5`, `aria-label="Voltar"`.
- [x] **T2.5** `orders/[id]` (consumidor): bloco de vasilhames agora só renderiza para
      pedidos legados (algum contador > 0). Linhas "Vasilhames (N)" do resumo de pagamento
      já eram condicionais (> 0). `order-timeline.tsx`: label BOTTLE_EXCHANGE mantido
      (troca física continua existindo).
- [x] **T2.6** Menu do distribuidor: entrada "Caução" comentada em `role-app-shell.tsx`
      (rota direta continua acessível).

### Validação da fase — EXECUTADA
- [x] Typecheck web: exit 0.
- [x] ESLint nos 5 arquivos alterados: 0 erros (só warnings `<img>` pré-existentes).
      Os 14 erros do lint completo são pré-existentes em arquivos não tocados
      (`distributor/queue`, hooks `set-state-in-effect`).
- [ ] Fluxo manual no preview: pendente (depende do seed da Fase 1 rodado no banco).

---

## FASE 3 — Assinaturas — ~~DISPENSADA~~ (2026-07-06)

**Banco novo não tem assinaturas** (confirmado pelo Matheus) — não há planos a repontar.

Fica apenas a **regra para o futuro** (registrada na arquitetura §4): todo `SubscriptionPlan`
novo deve apontar para produto sem `bottle_product_id` enquanto a caução B2C estiver desligada,
pois a geração de assinatura não passa pelo `createOrder` e não checa `is_active`.

---

## FASE 4 — Validação e2e + saneamento

**Objetivo:** provar as invariantes do design (arquitetura §5) no ambiente.

### Tarefas
- [ ] **T4.1** E2E manual pedido avulso: compra dos 2 produtos → aceite do distribuidor
      (atenção ao histórico do commit `01754e9` — item de estoque é o ponto frágil) →
      despacho → entrega com `recordBottleExchange` (coleta 1 vazio).
      Conferir: estoque movimentou (`EMPTY_RETURN_IN` + saídas), **zero** `DEPOSIT_*`,
      total do pedido == total do carrinho.
- [ ] **T4.2** ~~E2E pedido de assinatura~~ — dispensado (sem assinaturas no banco novo).
- [ ] **T4.3** Pedido "em voo" (se existir algum criado antes do deploy com settlement):
      entregar 1 e confirmar comportamento idempotente sem erro.
- [x] **T4.4** `scripts/check-enums.ts`: passou (20 enums) em 2026-07-06.
- [ ] **T4.5** Atualizar docs: `docs/Doc_sistema/CONTEXTO-DEMANDA-ATUAL.md` (marcar item 1 do
      roadmap como feito) e nota curta em `arquitetura_caucao_vasilhames.md` apontando que o
      fluxo B2C foi desativado por dados (link para este plano).

---

## Fora de escopo (deliberado)

- Remoção de código/tabelas da caução de vasilhames **v2** (reversibilidade; base do Comodato B2B). — A caução financeira **v1** foi removida em jul/2026 (ver `doc_desenvolvimento/caucao-vasilhames.md`).
- Filtro geográfico multi-distribuidora (próxima demanda, plano próprio).
- Renomear caução→comodato na UI do distribuidor (junto com a feature Comodato B2B).
- Cobrança dinâmica na entrega (bloqueada: regra comercial pendente com o cliente/Jean).
- Imagens definitivas dos produtos (pendência do cliente; usar provisória).

## Riscos e planos de contorno

| Risco | Mitigação |
|---|---|
| Produto novo sem InventoryItem → aceite quebra | T1.3 + validação T4.1 antes de liberar |
| Plano de assinatura FUTURO apontar p/ produto vinculado → caução reativa | Regra registrada (arquitetura §4); sem ação agora — banco sem assinaturas |
| 2+ InventoryItem ativos no mesmo produto → ambiguidade no aceite | Conferência explícita em T1.3 |
| Total divergente carrinho×cobrança | Invariante 2 verificada em T4.1 |
| Ambiente sem migrations da caução aplicadas | `prisma migrate deploy` antes da Fase 1 (pré-check) |

## Rollback

- Fase 1: reativar produtos antigos / desativar novos (só dados).
- Fase 2: revert do commit (sem migration).
- Fase 3: repontar planos de volta.
