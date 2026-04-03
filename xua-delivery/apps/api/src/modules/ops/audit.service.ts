import { getPrisma } from "../../infra/prisma/client.js";
import type { AuditEventType } from "@prisma/client";

export const auditExportService = {
  async findEvents(params: {
    startDate: string;
    endDate: string;
    eventTypes?: AuditEventType[];
    distributorId?: string;
  }) {
    const prisma = getPrisma();
    return prisma.auditEvent.findMany({
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
  },
};
