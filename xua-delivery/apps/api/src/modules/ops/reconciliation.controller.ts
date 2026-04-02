import type { Request, Response } from "express";
import { getPrisma } from "../../infra/prisma/client.js";
import { logger } from "../../infra/logger/index.js";
import { reconciliationSchema } from "@xua/shared/schemas/order";
import { auditRepository } from "../audit/audit.repository.js";
import { AuditEventType, ActorType, SourceApp, OrderStatus } from "@prisma/client";

export const reconciliationController = {
  /** GET /api/reconciliations — resumo do dia para o distribuidor */
  async get(req: Request, res: Response): Promise<void> {
    const distributorId = req.user!.sub;
    const date =
      (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
    const dayStart = new Date(date + "T00:00:00Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");

    try {
      const prisma = getPrisma();
      const orders = await prisma.order.findMany({
        where: {
          distributor_id: distributorId,
          delivery_date: { gte: dayStart, lte: dayEnd },
          status: {
            in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
          },
        },
        select: {
          id: true,
          qty_20l_sent: true,
          qty_20l_returned: true,
          returned_empty_qty: true,
          deposit_amount_cents: true,
          status: true,
          delivery_date: true,
        },
      });

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

      res.json({ orders, summary });
    } catch (error) {
      logger.error({ error }, "Error fetching reconciliation");
      res.status(500).json({ error: "Erro interno" });
    }
  },

  /** POST /api/reconciliations — fecha reconciliação diária */
  async close(req: Request, res: Response): Promise<void> {
    const parsed = reconciliationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const prisma = getPrisma();
      await prisma.$transaction(async (tx) => {
        for (const item of parsed.data.items) {
          await tx.order.update({
            where: { id: item.order_id },
            data: { returned_empty_qty: item.returned_empty_qty },
          });
        }

        await auditRepository.emit(
          {
            eventType: AuditEventType.DAILY_RECONCILIATION_CLOSED,
            actor: { type: ActorType.DISTRIBUTOR_USER, id: req.user!.sub },
            orderId: null,
            sourceApp: SourceApp.DISTRIBUTOR_WEB,
            payload: { items_count: parsed.data.items.length },
          },
          tx
        );
      });

      res.json({ ok: true });
    } catch (error) {
      logger.error({ error }, "Error closing reconciliation");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
