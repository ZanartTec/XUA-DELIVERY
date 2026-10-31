import type { Prisma, SalesReceipt } from "@prisma/client";
import { PaymentKind } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

const ISSUER_SELECT = {
  name: true,
  legal_name: true,
  trade_name: true,
  cnpj: true,
  state_registration: true,
  phone: true,
  email: true,
  zip_code: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  city: true,
  state: true,
} as const;

const LATEST_ORDER_PAYMENT = {
  where: { kind: PaymentKind.ORDER },
  orderBy: { created_at: "desc" },
  take: 1,
  select: { status: true, payment_method: true, cash_change_for_cents: true },
} as const;

/**
 * ReceiptRepository — persistência do comprovante de venda (`SalesReceipt`)
 * e leituras necessárias para montar o snapshot e renderizar o PDF.
 */
export const receiptRepository = {
  async findByOrderId(orderId: string, tx?: TxClient): Promise<SalesReceipt | null> {
    const client = tx ?? getPrisma();
    return client.salesReceipt.findUnique({ where: { order_id: orderId } });
  },

  /**
   * Reserva o próximo número da sequência da distribuidora. O UPDATE trava só
   * a linha dela até o fim da transação: emissões concorrentes da mesma
   * distribuidora serializam aqui, e um rollback devolve o número (sem buraco).
   */
  async reserveNextNumber(distributorId: string, tx: TxClient): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ number: number }>>`
      UPDATE "03_mst_distributors"
      SET next_receipt_number = next_receipt_number + 1
      WHERE id = ${distributorId}::uuid
      RETURNING next_receipt_number - 1 AS number
    `;
    const reserved = rows[0]?.number;
    if (reserved == null) throw new Error(`Distribuidora ${distributorId} não encontrada`);
    return Number(reserved);
  },

  async create(data: Prisma.SalesReceiptUncheckedCreateInput, tx: TxClient): Promise<SalesReceipt> {
    return tx.salesReceipt.create({ data });
  },

  /** Dados do pedido usados no snapshot da emissão. */
  async findOrderForSnapshot(orderId: string, tx: TxClient) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        consumer: { select: { name: true, phone: true, document: true } },
        address: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            zip_code: true,
          },
        },
        distributor: { select: ISSUER_SELECT },
        items: {
          orderBy: { created_at: "asc" },
          select: { product_name: true, quantity: true, unit_price_cents: true, subtotal_cents: true },
        },
        payments: LATEST_ORDER_PAYMENT,
      },
    });
    if (!order) return null;

    const driver = order.driver_id
      ? await tx.consumer.findUnique({ where: { id: order.driver_id }, select: { name: true } })
      : null;

    return { ...order, driver_name: driver?.name ?? null };
  },

  /** Comprovantes + estado atual do pedido/pagamento para renderização. */
  async findForPrint(orderIds: string[], tx?: TxClient) {
    const client = tx ?? getPrisma();
    return client.salesReceipt.findMany({
      where: { order_id: { in: orderIds } },
      orderBy: { number: "asc" },
      include: {
        order: {
          select: {
            status: true,
            payments: LATEST_ORDER_PAYMENT,
          },
        },
      },
    });
  },

  async registerPrints(ids: string[], tx: TxClient): Promise<void> {
    await tx.salesReceipt.updateMany({
      where: { id: { in: ids } },
      data: { print_count: { increment: 1 }, last_printed_at: new Date() },
    });
  },
};
