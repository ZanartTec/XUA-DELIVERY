import { getPrisma } from "../../infra/prisma/client.js";
import type { AuditEventType } from "@prisma/client";
import { createLogger } from "../../infra/logger";

const log = createLogger("audit-export");

export const auditExportService = {
  async findEvents(params: {
    startDate: string;
    endDate: string;
    eventTypes?: AuditEventType[];
    distributorId?: string;
  }) {
    const prisma = getPrisma();
    const events = await prisma.auditEvent.findMany({
      where: {
        occurred_at: {
          gte: new Date(params.startDate),
          lte: new Date(`${params.endDate}T23:59:59.999Z`),
        },
        ...(params.eventTypes?.length
          ? { event_type: { in: params.eventTypes } }
          : {}),
        ...(params.distributorId
          ? { order: { distributor_id: params.distributorId } }
          : {}),
      },
      include: {
        order: { select: { id: true, distributor_id: true } },
      },
      orderBy: { occurred_at: "asc" },
    });

    log.info({ startDate: params.startDate, endDate: params.endDate, count: events.length }, "Audit events exported");
    return events;
  },
};
