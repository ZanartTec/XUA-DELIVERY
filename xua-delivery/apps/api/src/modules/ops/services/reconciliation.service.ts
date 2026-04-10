import type { Prisma } from "@prisma/client";
import {
  OrderStatus,
  AuditEventType,
  ActorType,
  SourceApp,
} from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { reconciliationRepository } from "../repository/reconciliation.repository.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("reconciliation");

type TxClient = Prisma.TransactionClient;

export const reconciliationService = {
  async getSummary(distributorId: string, date: string) {
    const dayStart = new Date(date + "T00:00:00Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");

    const orders =
      await reconciliationRepository.findOrdersForReconciliation(
        distributorId,
        dayStart,
        dayEnd,
        [OrderStatus.DELIVERED, OrderStatus.CANCELLED]
      );

    const rows = orders.map((o) => {
      const sent = o.qty_20l_sent ?? 0;
      const returned = o.returned_empty_qty ?? 0;
      return {
        order_id: o.id,
        consumer_name: o.consumer.name,
        sent_qty: sent,
        returned_qty: returned,
        delta: sent - returned,
      };
    });

    const summary = {
      total_sent: rows.reduce((s, r) => s + r.sent_qty, 0),
      total_returned: rows.reduce((s, r) => s + r.returned_qty, 0),
      total_deposit_cents: orders.reduce(
        (s, o) => s + (o.deposit_amount_cents ?? 0),
        0
      ),
      orders_count: orders.length,
    };

    return { rows, summary };
  },

  async close(
    items: Array<{ order_id: string; returned_empty_qty: number }>,
    userId: string,
    distributorId: string,
    date: string,
    justification?: string
  ) {
    const prisma = getPrisma();
    const dayStart = new Date(date + "T00:00:00Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");
    const emptyReturned = items.reduce((s, i) => s + i.returned_empty_qty, 0);

    await prisma.$transaction(async (tx: TxClient) => {
      for (const item of items) {
        await reconciliationRepository.updateReturnedQty(
          item.order_id,
          item.returned_empty_qty,
          tx
        );
      }

      const orders = await reconciliationRepository.findOrdersForReconciliation(
        distributorId,
        dayStart,
        dayEnd,
        [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
        tx
      );
      const fullOut = orders.reduce((s, o) => s + (o.qty_20l_sent ?? 0), 0);
      const delta = fullOut - emptyReturned;

      if (delta > 0 && (!justification || justification.trim().length < 5)) {
        throw new Error("JUSTIFICATION_REQUIRED");
      }

      await reconciliationRepository.insertReconciliation(
        {
          distributorId,
          reconciliationDate: dayStart,
          fullOut,
          emptyReturned,
          delta,
          justification: justification?.trim() || null,
          closedBy: userId,
        },
        tx
      );

      await auditRepository.emit(
        {
          eventType: AuditEventType.DAILY_RECONCILIATION_CLOSED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: userId },
          orderId: null,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: { items_count: items.length, delta },
        },
        tx
      );
    });

    log.info({ userId, itemsCount: items.length }, "Reconciliation closed");
  },
};
