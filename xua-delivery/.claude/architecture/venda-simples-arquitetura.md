# Arquitetura — Venda Simples (fluxo do pedido SEM caução)

> Fonte da verdade do design. Decisão de reunião com o cliente (Chuá, jul/2026):
> o consumidor B2C vê apenas 2 produtos e compra sem qualquer conceito de caução/troca
> configurável. A infra de caução **não é removida** — fica quiesciente (desativada por dados)
> para virar a base do futuro "Comodato B2B".
>
> Plano de execução: `.claude/plans/venda-simples-plano-implementacao.md`
> Estado vivo: `.claude/context/venda-simples-contexto.md`

---

## 1. Decisão central: desligamento por DADOS, não por código

Todo o acoplamento da caução no fluxo ativo passa por um único gatilho:

```
Product.kind === WATER  &&  Product.bottle_product_id != null
```

(filtro em `apps/api/src/modules/deposits/services/deposit-settlement.service.ts:95` —
único uso de `ProductKind` em toda a API, verificado por grep).

Se os produtos vendidos não satisfazem essa condição, TODA a cadeia de caução no-opa
naturalmente, sem tocar em código:

| Ponto | Comportamento com produto sem vínculo |
|---|---|
| `resolveBottleGroups` (create-order) | retorna `[]` → sem item de vasilhame injetado, total = soma simples |
| `settlePerBottle` / preview checkout | vazio → contadores `bottles_sold/loaned` = 0 |
| Steppers "vazios para troca" no cart (web) | `bottleGroups` vazio → somem sozinhos |
| `settleDelivery` (driver exchange) | no-op pelo mesmo filtro → zero movimentos `DEPOSIT_*` |

**Rollback trivial**: religar = reativar produtos antigos / preencher `bottle_product_id`.
Nenhuma migration, nenhuma remoção destrutiva.

## 2. Catálogo alvo (cadastro manual, sem lógica especial)

| Produto | Preço | kind | bottle_product_id | InventoryItem |
|---|---|---|---|---|
| Água mineral 20L | R$ 12,00 | `OTHER` | `null` | 1 ativo, `SELLABLE_PRODUCT` |
| Água mineral 20L + galão 20L | R$ 37,00 | `OTHER` | `null` | 1 ativo, `SELLABLE_PRODUCT` |

- `kind = OTHER` é seguro em todo o caminho: o aceite do distribuidor **não olha kind**
  (verificado: `resolveOrderInventoryLines` só exige InventoryItem ativo vinculado, e
  `findActiveInventoryItemsByProductIds` aceita `SELLABLE_PRODUCT`/`RETURNABLE_FULL`/`RETURNABLE_EMPTY`
  — `inventory.repository.ts:224`).
- Regra dura: **exatamente 1** InventoryItem ativo por produto (0 → erro
  `"Produto sem item de estoque ativo vinculado"` no aceite; >1 → warn + ambiguidade).
- Produtos antigos (WATER vinculado + BOTTLE): `is_active = false`. **Nunca editar/reaproveitar**
  (pedidos históricos referenciam `product_id`; e o catálogo público não filtra kind — um
  BOTTLE ativo apareceria para o consumidor).

## 3. Caminho do pedido ponta a ponta (estado alvo)

```
CONSUMIDOR (web PWA)
  Catálogo (2 produtos, is_active=true)        apps/web/app/(consumer)/catalog
    → Carrinho (sem steppers, sem caução)      apps/web/app/(consumer)/cart
    → Endereço + Distribuidora (por zona/CEP)  checkout/distributor  [inalterado nesta feature]
    → Agendamento (slots da distribuidora)     checkout/schedule     [+ botão voltar maior]
    → Pagamento (métodos da distribuidora)     checkout/payment      [+ avisos de vasilhame]
    → POST /orders (createOrder)
         · resolveBottleGroups → []  (no-op de caução)
         · total = subtotal dos itens
         · bottles_* = 0, deposit_cents = 0

DISTRIBUIDOR
  Aceite (ACCEPTED_BY_DISTRIBUTOR)
    · resolveOrderInventoryLines: 1 InventoryItem ativo por produto (kind-agnóstico)
    · movimento de estoque de saída por item
  Preparo / despacho ao motorista

MOTORISTA (driver web)
  Entrega
    · recordBottleExchange PERMANECE (troca física do galão existe no produto R$12):
        coleta vazio → EMPTY_RETURN_IN no estoque (item RETURNABLE_EMPTY global)
        settleDelivery → no-op (sem produtos vinculados)
    · non-collection PERMANECE (base da futura cobrança na porta — pendência do cliente)
  Conclusão do pedido → pagamento na entrega ou já pago online
```

### O que fica ATIVO (não é caução, é operação física/financeira)
- `recordBottleExchange` + movimento `EMPTY_RETURN_IN` (orders/order-bottle.service.ts)
- `non-collection` do driver
- Todo o fluxo de pagamento multi-gateway, agendamento, zonas, notificações

### O que fica QUIESCENTE (mantido, inerte, sem uso no fluxo)
- Módulo `apps/api/src/modules/deposits/` inteiro (rotas passam a responder tudo zero)
- Models `ConsumerDepositProgram/Balance/Movement` (base do Comodato B2B futuro)
- `Product.bottle_product_id`, enum `ProductKind` (sem preencher vínculo)
- Tela `distributor/deposit-program` (ocultar do menu; não deletar)
- Campo `emptyBottlesByBottle` no cart store (parar de alimentar; não deletar)

### O que NÃO existe (confirmado por inspeção)
- Worker/processor BullMQ de caução: não há. Única menção é `PaymentKind.DEPOSIT` no
  resolver de webhook — legado da caução financeira morta (`deposit_amount_cents` sempre 0).
  Nada a desligar na fila.

## 4. O furo das assinaturas (registrado — SEM ação agora)

`subscription-generation.service.ts:108-137` gera pedidos a partir de `plan.product`
**direto**, sem passar pelo `createOrder` e **sem checar `is_active`**. Se um
`SubscriptionPlan` apontasse para o produto WATER antigo (vinculado), o `settleDelivery`
da entrega reativaria a caução silenciosamente para pedidos de assinatura.

**Status (2026-07-06, confirmado pelo Matheus): o banco novo não tem assinaturas ainda** —
não há nada a repontar agora. Fica registrado como regra para o futuro: qualquer
`SubscriptionPlan` criado deve apontar para produto sem `bottle_product_id` enquanto o
comodato B2C estiver desligado.

## 5. Invariantes do estado alvo (critérios de aceitação do design)

1. Nenhum pedido novo (avulso ou de assinatura) gera movimento `DEPOSIT_*` nem item de
   vasilhame injetado.
2. Total exibido no carrinho == total cobrado (sem soma invisível de vasilhame vendido).
3. Consumidor nunca vê stepper, texto ou preview de caução em nenhuma tela.
4. Aceite do distribuidor funciona para os 2 produtos novos (InventoryItem 1:1 ativo).
5. Troca física na entrega continua movimentando estoque (`EMPTY_RETURN_IN`).
6. Catálogo público exibe exatamente os 2 produtos.
7. Nenhuma tabela/rota/model de caução removida (reversibilidade garantida).

## 6. Riscos residuais e observação

- **Saldos residuais** em `ConsumerDepositBalance` > 0 (dados de teste): dívida fantasma sem
  fluxo de abatimento. Zerar/registrar na implantação.
- **Pedidos em voo** no deploy (criados com settlement, entregues depois): `settleDelivery` é
  idempotente por `order_id` e resolve pelos itens do pedido — comporta o cenário; validar 1 caso.
- Campos `bottles_*`/`deposit_*` do Order passam a ser sempre 0 — telas de detalhe devem
  tratar 0 como "não exibir" (maioria já condicional; verificar payment e order-detail).
