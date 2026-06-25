# Caução de Vasilhames — Arquitetura (v2, implementada)

> Substitui a antiga **caução financeira** (R$ 30 fixos na 1ª compra) por **caução de vasilhames**:
> controle de responsabilidade sobre garrafões emprestados pela distribuidora a consumidores habilitados.

## Princípio

- **Venda de vasilhame é o comportamento PADRÃO/default do checkout.** Faltando vasilhames
  (pediu N águas, trouxe M < N vazios), os `N − M` faltantes são **adicionados ao pedido como
  item de venda real** — o vasilhame é um **Produto próprio** (`Product.kind = BOTTLE`) com seu
  `price_cents`. Não é taxa fixa.
- **Vínculo água→vasilhame:** cada água (`Product.kind = WATER`) aponta para seu vasilhame via
  `Product.bottle_product_id`. Assim o backend sabe **qual** vasilhame adicionar e a **quantidade**
  certa. Os vazios para troca são informados **por tipo de vasilhame**.
- **Caução é uma EXCEÇÃO operacional** concedida pela distribuidora. Só ocorre quando:
  vínculo ativo `Distribuidora×Consumidor`, a distribuidora **escolhida no pedido** é a do vínculo,
  e há saldo dentro de `max_bottles`.
- **Sem vínculo ativo → todo faltante é vendido** (obrigatório).
- **Toda decisão/validação é do backend.** O front só envia `empty_bottles_provided` e exibe o resultado.

## Motor de settlement

```
missing = max(0, bottlesFullOrdered − emptyBottlesProvided)
sold = missing; loaned = 0                 // DEFAULT = venda
elegível = programa ativo (is_enabled) E max_bottles > 0 (na distribuidora do pedido)
se elegível:
  headroom = max(0, max_bottles − saldoAtual)
  loaned = min(missing, headroom)
  sold   = missing − loaned                // excedente vira venda
```

Implementação: `apps/api/src/modules/deposits/services/deposit-settlement.service.ts` (`computeSettlement`).

## Excedente de limite

**Regra atual (provisória, sujeita a revisão):** vasilhames faltantes que ultrapassam o limite
(`max_bottles`) do consumidor são **vendidos automaticamente** (fallback para o comportamento padrão).

Alternativas futuras possíveis:
- bloquear o pedido;
- exigir aprovação manual da distribuidora;
- permitir estouro temporário do teto.

A escolha atual prioriza **nunca travar o checkout** do consumidor.

## Vinculação (CPF/CNPJ)

- A distribuidora **busca o consumidor por CPF/CNPJ** (`GET /api/distributor/deposit-program/lookup`).
- O vínculo persiste **`consumer_id` (FK estável)** + **`consumer_document_snapshot`** (dado, não FK —
  o documento pode mudar). `Consumer.document` é normalizado (só dígitos) e validado no backend.
- `max_bottles = 0` ⇒ **bloqueado** (nunca "ilimitado").

## Abatimento da dívida (entrega)

Na confirmação da entrega (`recordBottleExchange` → `settleDelivery`):
- empresta faltantes elegíveis (`LOAN_OUT` + estoque `DEPOSIT_LOAN_OUT`);
- abate dívida com vazios excedentes aos cheios entregues (`RETURN_IN`, somente ledger — o retorno
  físico já é `EMPTY_RETURN_IN`);
- nunca deixa o saldo negativo; idempotente por `order_id`.

## Dados

- `35_cfg_consumer_deposit_programs` (vínculo + limite + snapshot do documento)
- `36_trn_consumer_deposit_balances` (saldo materializado por distribuidora×consumidor×vasilhame)
- `37_log_consumer_deposit_movements` (histórico event-sourcing: `LOAN_OUT`/`RETURN_IN`/`MANUAL_ADJUSTMENT`/`WRITE_OFF`)
- `Product`: `kind` (`ProductKind`: WATER/BOTTLE/OTHER) + `bottle_product_id` (auto-relação água→vasilhame).
- `Order`: `bottles_full_ordered`, `empty_bottles_provided`, `bottles_sold`, `bottles_loaned` (agregados;
  o detalhe por tipo vive nos itens de venda do vasilhame e no ledger de caução). Campos
  `deposit_cents`/`deposit_amount_cents` deprecated = 0 até a remoção destrutiva final.

## APIs

- Consumidor: `POST /api/consumers/:id/deposit/preview`, `GET /api/consumers/:id/deposit/balance`.
- Distribuidora: `GET/POST/PATCH /api/distributor/deposit-program*`, `GET /api/distributor/deposit/balances`,
  `POST /api/distributor/deposit/:consumerId/adjust`.

## Pendências (fase destrutiva — após observação + validação em base com dados)

- Arquivar `15_trn_deposits` e remover `model Deposit`, `enum DepositStatus`, `PaymentKind.DEPOSIT`,
  eventos `DEPOSIT_HELD/REFUND_INITIATED/REFUNDED` e os campos `deposit_*` de `Order`.
