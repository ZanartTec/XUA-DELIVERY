# Contexto de Demanda Atual — XUA Delivery

> Arquivo de contexto rápido para IA/devs. Leia isto antes de mexer em qualquer coisa
> relacionada a catálogo, caução/comodato, zonas de entrega ou checkout.
> Atualizado em: 2026-07-06 (pós-reunião de alinhamento com o cliente Chuá/Jean).

## Status das demandas

### ✅ CONCLUÍDA — Caução de vasilhames (refactor da caução financeira)

Substituição da caução financeira (R$30 fixo) por empréstimo/controle de vasilhames.
Implementada e mergeada na `develop`. Referências:

- Models: `ConsumerDepositProgram` (35), `ConsumerDepositBalance` (36), `ConsumerDepositMovement` (37) em `prisma/schema.prisma`
- Enum `ProductKind` (WATER / BOTTLE / OTHER) + auto-relação `Product.bottle_product_id` (água → seu vasilhame)
- Módulo `apps/api/src/modules/deposits/` (program, settlement, repo, controller)
- Integração em `create-order.service.ts` (venda default de vasilhame faltante) e no exchange do driver (settlement na entrega)
- Telas: `distributor/deposit-program`, steppers de vazios no cart do consumidor
- Doc detalhada: `docs/Doc_sistema/arquitetura_caucao_vasilhames.md`

**Essa infraestrutura NÃO deve ser removida** — ela é a base do novo "Comodato B2B" (abaixo).

---

## 🔥 DEMANDA ATUAL (reunião com cliente Chuá, jul/2026)

O cliente testou o app e rejeitou a complexidade da caução no fluxo B2C. Decisões:

### 1. Catálogo B2C fixo com apenas 2 produtos

- **Água Mineral Chuá 20L — R$ 12,00**: pressupõe que o cliente entrega 1 vasilhame
  vazio em bom estado na troca. Sem perguntas no carrinho.
- **Água Mineral 20L + Vasilhame — R$ 37,00**: o galão fica com o cliente (venda definitiva).

O que muda no código:
- Remover do fluxo do consumidor os steppers de "vasilhames vazios para troca"
  (`apps/web/app/(consumer)/cart/page.tsx`, ~linha 165+) e qualquer preview/menção de caução
  (checkout, payment, order detail).
- Venda R$ 12 assume troca 1:1 implícita; venda R$ 37 inclui o vasilhame.
- Cadastrar/ajustar os 2 produtos (via `(ops)/ops/products` ou seed). **Decisão em aberto**:
  R$ 37 será produto único no cadastro ou combinação água+vasilhame como 2 itens do pedido
  (impacta estoque, que separa `RETURNABLE_FULL` / `RETURNABLE_EMPTY`).
- Jornada alvo: compra em ~2 cliques (produto → pagamento).

### 2. "Caução" → "Comodato", exclusivo do distribuidor (B2B)

- Renomear toda a linguagem visível de "caução" para "comodato".
- O consumidor final **nunca** vê comodato — remover qualquer resquício do fluxo B2C.
- Módulo do distribuidor (`distributor/deposit-program`) vira ferramenta interna de
  controle de vasilhames emprestados a empresas parceiras/PJ (vínculo por CPF/CNPJ já existe).

### 3. Filtro geográfico de distribuidoras (CEP/Bairro) — multi-distribuidora

Estado atual do código (evidência):
- `Zone` pertence a UMA distribuidora; `ZoneCoverage` guarda bairro/CEP (`prisma/schema.prisma`).
- Na criação do endereço, `consumers.service.ts` resolve `findZoneCoverage` e grava **um único**
  `zone_id` no `Address` (a primeira cobertura encontrada).
- O checkout (`checkout/distributor/page.tsx` → `DistributorSelector`) filtra por esse `zone_id`.

**Limitação a corrigir**: como o endereço congela 1 zona (de 1 distribuidora), o consumidor só vê
1 distribuidora. A reunião exige mostrar **TODAS** as distribuidoras que cobrem o CEP/bairro.

Direção acordada:
- Resolver cobertura **em tempo de consulta**: `/api/distributors` deve cruzar o CEP/bairro do
  endereço selecionado com todas as `ZoneCoverage` ativas, retornando todas as distribuidoras
  elegíveis. Deixar de depender do `zone_id` congelado no `Address` (cuidado: `Order.zone_id`
  é obrigatório — definir a zona no momento do pedido, não do endereço).
- Cobertura definida por **bairros/CEPs cadastrados** (não raio Google Maps) — decisão do analista,
  mais rápida e evita "olho gordo" de distribuidor.
- Operação Chuá deve poder limitar/restringir zonas de um distribuidor (monitoramento da matriz).

### 4. Ajustes de UI/UX

- Engrossar/ampliar a área de clique da seta "voltar" na tela de agendamento
  (`checkout/schedule/page.tsx`, botão `h-9 w-9` com `ArrowLeft`).
- Inserir textos de aviso antes de finalizar a compra: necessidade de ter vasilhame vazio
  em bom estado/validade para a opção R$ 12, e possível cobrança extra se o galão estiver danificado.

### 5. PWA prioritário

- Distribuição via link/QR Code (evitar burocracia da Apple Store). Versão nativa iOS em segundo plano.
- Verificar estado do manifest/service worker em `apps/web` (não auditado ainda).

---

## ⏸️ Bloqueado / aguardando o cliente

1. **Cobrança dinâmica na entrega** — se o vasilhame do cliente estiver danificado, vencido ou
   ausente na porta, como cobrar a diferença? Jean (cliente) vai definir a regra comercial.
   Base técnica já existe: fluxos `driver/deliveries/[id]/exchange` e `non-collection`.
   Sugestão do analista: taxa extra via PIX/link de pagamento emitida pelo entregador no ato.
2. **Imagens definitivas dos 2 produtos** — cliente/equipe vão definir (possivelmente via IA,
   galão com e sem rótulo).

## Regras de negócio consolidadas

- Água R$ 12 só se o cliente tiver vasilhame em bom estado e na validade para trocar;
  caso contrário o entregador cobra o valor da embalagem.
- Operação Chuá é matriz analítica: **não** roteia pedidos manualmente; o app liga
  Cliente ↔ Distribuidor por zona de CEP automaticamente.
- Preços são fixados pela matriz (estratégia de entrada), não pelo distribuidor.
- Comodato só para distribuidores/empresas parceiras — nunca elegível ao B2C.

## Ordem de execução recomendada

1. ✅ Catálogo fixo + carrinho simplificado — implementado na branch
   `feature/venda-simples-sem-caucao` (2026-07-06). Plano/estado:
   `.claude/plans/venda-simples-plano-implementacao.md` e `.claude/context/venda-simples-contexto.md`.
   Pendente: rodar `prisma/seed-venda-simples.ts` no banco + e2e manual.
2. ✅ Avisos textuais + botão voltar — incluídos no item 1.
3. Filtro geográfico multi-distribuidora (mudança de query + desacoplar `Address.zone_id`)
4. Renomear caução→comodato e isolar no módulo distribuidor
5. Cobrança dinâmica na entrega (bloqueado pela regra do cliente)

## Cuidados antes de começar

- Validar se a migração da caução (`20260624030000_add_bottle_deposit_program` e
  `20260624040000_add_product_kind_bottle_link`) está aplicada no ambiente alvo.
- Typecheck da API tinha erros pré-existentes (resend, passwordResetToken); vitest ausente
  no ambiente local — não confundir com regressão nova.
- `scripts/check-enums.ts` exige paridade de enums schema ↔ shared.
- Escala projetada: ~150 distribuidoras, expansão Zona da Mata MG + RJ — queries de cobertura
  precisam de índice em `ZoneCoverage.zip_code` / `neighborhood`.
