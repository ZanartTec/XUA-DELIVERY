import type { Prisma, OrderStatus } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

const RECONCILIATION_SELECT = {
  id: true,
  qty_20l_sent: true,
  qty_20l_returned: true,
  returned_empty_qty: true,
  deposit_amount_cents: true,
  status: true,
  delivery_date: true,
  consumer: { select: { name: true } },
} as const;

export const reconciliationRepository = {
  async findOrdersForReconciliation(
    distributorId: string,
    dayStart: Date,
    dayEnd: Date,
    statuses: OrderStatus[],
    tx?: TxClient
  ) {
    const prisma = getPrisma();
    return (tx ?? prisma).order.findMany({
      where: {
        distributor_id: distributorId,
        delivery_date: { gte: dayStart, lte: dayEnd },
        status: { in: statuses },
      },
      select: RECONCILIATION_SELECT,
    });
  },

  async updateReturnedQty(
    orderId: string,
    returnedEmptyQty: number,
    tx: TxClient
  ) {
    return tx.order.update({
      where: { id: orderId },
      data: { returned_empty_qty: returnedEmptyQty },
    });
  },

  async insertReconciliation(
    data: {
      distributorId: string;
      reconciliationDate: Date;
      fullOut: number;
      emptyReturned: number;
      delta: number;
      justification?: string | null;
      closedBy: string;
    },
    tx: TxClient
  ) {
    return tx.reconciliation.create({
      data: {
        distributor_id: data.distributorId,
        reconciliation_date: data.reconciliationDate,
        full_out: data.fullOut,
        empty_returned: data.emptyReturned,
        delta: data.delta,
        justification: data.justification ?? null,
        closed_by: data.closedBy,
      },
    });
  },
};
