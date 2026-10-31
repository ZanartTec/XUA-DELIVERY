/**
 * Snapshot do comprovante de venda e entrega (SEM valor fiscal).
 *
 * Gravado uma única vez, na emissão, em `39_trn_sales_receipts.snapshot`.
 * Reimpressões (2ª via) usam sempre este snapshot — nunca os dados atuais do
 * cadastro — para que o documento entregue ao cliente não mude depois.
 *
 * Exceção deliberada: o *status* do pagamento NÃO é congelado. Um pedido em
 * dinheiro sai "A RECEBER" no despacho e precisa sair "PAGO" na 2ª via depois
 * da entrega; por isso só o método fica aqui e o status é lido na renderização.
 *
 * Mudou o formato? Incremente `RECEIPT_SNAPSHOT_VERSION` e mantenha o
 * renderer compatível com as versões já gravadas.
 */
export const RECEIPT_SNAPSHOT_VERSION = 1;

export type ReceiptAddress = {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

export type ReceiptSnapshotV1 = {
  version: 1;
  issuer: {
    /** Razão social; cai para o nome da distribuidora quando não cadastrada. */
    legal_name: string;
    trade_name: string | null;
    cnpj: string;
    state_registration: string | null;
    phone: string;
    email: string;
    address: ReceiptAddress;
  };
  customer: {
    name: string;
    document: string | null;
    phone: string | null;
    address: ReceiptAddress;
    delivery_instructions: string | null;
  };
  order: {
    id: string;
    short_id: string;
    created_at: string;
    delivery_date: string;
    delivery_window: string;
    scheduled_time_label: string | null;
    driver_name: string | null;
  };
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }>;
  totals: {
    subtotal_cents: number;
    total_cents: number;
  };
  payment: {
    method: string | null;
    cash_change_for_cents: number | null;
  };
  bottles: {
    full_ordered: number;
    empty_provided: number;
    sold: number;
    loaned: number;
  };
};

export type ReceiptSnapshot = ReceiptSnapshotV1;
