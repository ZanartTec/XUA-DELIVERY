# Comprovante de Venda e Entrega (PDF, sem valor fiscal)

> Entregue em 30/10/2026. Migration: `prisma/migrations/20261030120000_sales_receipts`.

## Por quê

O pedido só existia no digital. A distribuidora precisava de um documento impresso para o
motorista entregar ao cliente na hora da entrega, parecido com uma nota fiscal mas **sem
nenhuma integração com Receita/SEFAZ**. O título é "Comprovante de Venda e Entrega" e o
documento traz a tarja **"DOCUMENTO SEM VALOR FISCAL"**.

## Regras

- **Um comprovante por pedido** (`39_trn_sales_receipts.order_id` UNIQUE).
- **Numeração sequencial por distribuidora** (`UNIQUE(distributor_id, number)`). O número
  é reservado com `UPDATE "03_mst_distributors" SET next_receipt_number = next_receipt_number + 1 … RETURNING`
  dentro da transação de emissão: o lock fica só na linha da distribuidora, e um rollback
  devolve o número (não há buraco na sequência).
- **Emissão automática no despacho** (`dispatch` e `dispatchWithChecklist`), na mesma
  transação do OTP. Se a emissão falhar, o despacho inteiro sofre rollback.
- **Emissão manual** (`POST /api/orders/:id/receipt`) a partir do aceite, idempotente.
  Emissões simultâneas do mesmo pedido: a perdedora bate na unique de `order_id` e devolve a vencedora.
- **Reentrega** reaproveita o mesmo comprovante (`issueInTx` é idempotente).
- **Snapshot imutável** (`snapshot` JSON, `snapshot_version`): emitente, cliente, itens,
  totais, método de pagamento e vasilhames ficam congelados. Reimpressão = mesmo conteúdo.
- **Exceção:** o *status* do pagamento é lido na hora da impressão, para que um pedido em
  dinheiro saia "A RECEBER" no despacho e "PAGO" na 2ª via depois da entrega.
- **GET do PDF nunca emite.** Sem comprovante → 404 `RECEIPT_NOT_ISSUED`.
- Cada GET conta como impressão: `print_count`/`last_printed_at` + audit `RECEIPT_PRINTED`.
  A partir da segunda impressão o PDF sai como **"2ª VIA"**. Pedido cancelado sai com a
  tarja **"PEDIDO CANCELADO"**.

### Linha de pagamento

| Método | Status | Texto |
|---|---|---|
| `pix` / `credit` | `CAPTURED` | `PAGO – PIX` / `PAGO – CARTÃO DE CRÉDITO` |
| `pix` / `credit` | outro | `AGUARDANDO PAGAMENTO – …` |
| qualquer | `REFUNDED` | `ESTORNADO – …` |
| `cash` | não capturado | `A RECEBER – DINHEIRO (troco p/ R$ X)` |
| `card_on_delivery` | não capturado | `A RECEBER – CARTÃO NA ENTREGA` |
| `cash` / `card_on_delivery` | `CAPTURED` | `PAGO – DINHEIRO` / `PAGO – CARTÃO` |
| nulo (pagamento legado) | `CAPTURED` / `REFUNDED` / outro | `PAGO` / `ESTORNADO` / `A RECEBER` |

## Arquitetura

Tudo roda na **API, de forma síncrona**: não usa fila, worker nem storage. O PDF é
desenhado com **pdfkit** e enviado direto na resposta HTTP enquanto é gerado
(`doc.pipe(res)`), sem montar o arquivo em memória.

| Peça | Arquivo |
|---|---|
| Emissão / impressão | `apps/api/src/modules/orders/services/receipt.service.ts` |
| Persistência e numeração | `apps/api/src/modules/orders/repository/receipt.repository.ts` |
| Tipo do snapshot | `apps/api/src/modules/orders/receipt-pdf/receipt-snapshot.ts` |
| Formatadores (R$, CPF/CNPJ, pagamento) | `apps/api/src/modules/orders/receipt-pdf/receipt-format.ts` |
| Layout A4 + térmico | `apps/api/src/modules/orders/receipt-pdf/render-receipt.ts` |
| Resposta HTTP | `apps/api/src/modules/orders/receipt-pdf/send-receipt-pdf.ts` |

**Formatos** (`?format=a4|thermal`, schema `receiptQuerySchema` em `@xua/shared/schemas/order`):
- `a4`: página A4 com tabela de itens e quebra de página automática.
- `thermal`: bobina de 80 mm. A altura da página é **medida antes de desenhar** (um passe
  sem desenho no `ReceiptWriter`), então cada comprovante ocupa uma página do tamanho exato.

O mesmo layout (`writeReceipt`) atende aos dois formatos; o que muda é a `FormatSpec`.
O QR code aponta para a tela **autenticada** do pedido (`APP_ORIGIN/orders/:id`), nunca para o PDF.

## Endpoints

| Rota | Papéis | Rate limit |
|---|---|---|
| `POST /api/orders/:id/receipt` | `distributor_admin` | `orders:action` |
| `GET /api/orders/:id/receipt.pdf?format=` | `distributor_admin`, `driver`, `ops`, `support` | `receiptRead` (30/min) |
| `GET /api/distributor/routes/:id/receipts.pdf?format=` | `distributor_admin` | `heavyRead`; máximo de 100 pedidos (422 `RECEIPT_BATCH_TOO_LARGE`) |
| `GET /api/distributor/cep/:cep` | `ops`, `distributor_admin` | `externalLookup` |

O controle de acesso é feito por `orderPolicy.canAccess`: a distribuidora só acessa os
próprios pedidos e o motorista só os atribuídos a ele. Consumidor não acessa o PDF. As
respostas saem com `Cache-Control: no-store` (o documento tem CPF e endereço).

## Frontend

- Cadastro do emitente: `app/(ops)/ops/distributors/page.tsx`, seção "Dados do emitente",
  com preenchimento pelo CEP. A listagem mostra o badge "Dados do emitente incompletos".
  Sem razão social, o comprovante usa `name`.
- Detalhe do pedido (distribuidora): `src/components/distributor/order-receipt-section.tsx`.
- Checklist: toast "Comprovante Nº X gerado" com a ação "Imprimir" depois do despacho.
- Rota: botão "Imprimir comprovantes" (lote).
- Motorista: "Ver comprovante de venda" na tela do OTP (formato padrão: térmico).
- O formato preferido fica no `localStorage` (`xua:receipt-format`). Os PDFs abrem em aba
  nova via o proxy `/api/*` do Next (mesma origem, o cookie vai junto).

## Próximos passos (fora do escopo)

- A própria distribuidora editar os dados do emitente no painel dela.
- NFC-e/NF-e via integrador: entra no worker/BullMQ, usando `SalesReceipt.kind`.
- Enviar o comprovante ao cliente por e-mail (job do worker com Resend).
