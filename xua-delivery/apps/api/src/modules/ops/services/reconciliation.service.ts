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

    const summary = {
      total_sent: orders.reduce((s, o) => s + (o.qty_20l_sent ?? 0), 0),
      total_returned: orders.reduce(
        (s, o) => s + (o.returned_empty_qty ?? 0),
        0
      ),
      total_deposit_cents: orders.reduce(
        (s, o) => s + (o.deposit_amount_cents ?? 0),
        0
      ),
      orders_count: orders.length,
    };

    return { orders, summary };
  },

  async close(
    items: Array<{ order_id: string; returned_empty_qty: number }>,
    userId: string
  ) {
    const prisma = getPrisma();
    await prisma.$transaction(async (tx: TxClient) => {
      for (const item of items) {
        await reconciliationRepository.updateReturnedQty(
          item.order_id,
          item.returned_empty_qty,
          tx
        );
      }

      await auditRepository.emit(
        {
          eventType: AuditEventType.DAILY_RECONCILIATION_CLOSED,
          actor: { type: ActorType.DISTRIBUTOR_USER, id: userId },
          orderId: null,
          sourceApp: SourceApp.DISTRIBUTOR_WEB,
          payload: { items_count: items.length },
        },
        tx
      );
    });

    log.info({ userId, itemsCount: items.length }, "Reconciliation closed");
  },
};
