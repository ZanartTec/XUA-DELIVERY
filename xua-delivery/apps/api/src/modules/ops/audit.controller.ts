import type { Request, Response } from "express";
import { logger } from "../../infra/logger/index.js";
import { auditExportSchema } from "@xua/shared/schemas/audit";
import type { AuditEventType } from "@prisma/client";
import { buildCsv } from "../../utils/csv.js";
import { auditExportService } from "./audit.service.js";

export const auditController = {
  /** GET /api/audit/export — exporta eventos de auditoria como CSV */
  async exportCsv(req: Request, res: Response): Promise<void> {
    const params = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      distributorId: (req.query.distributorId as string) || undefined,
      eventTypes: Array.isArray(req.query.eventTypes)
        ? (req.query.eventTypes as string[])
        : req.query.eventTypes
          ? [req.query.eventTypes as string]
          : [],
    };

    const parsed = auditExportSchema.safeParse(params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { startDate, endDate, distributorId, eventTypes } = parsed.data;

    try {
      const events = await auditExportService.findEvents({
        startDate,
        endDate,
        eventTypes: eventTypes as AuditEventType[] | undefined,
        distributorId,
      });

      const CSV_HEADERS = [
        "id",
        "event_type",
        "actor_type",
        "actor_id",
        "order_id",
        "source_app",
        "occurred_at",
        "payload",
      ];
      const rows = events.map((e) => [
        e.id,
        e.event_type,
        e.actor_type,
        e.actor_id,
        e.order_id || "",
        e.source_app,
        e.occurred_at.toISOString(),
        JSON.stringify(e.payload || {}),
      ]);

      const csv = buildCsv(CSV_HEADERS, rows);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit_${startDate}_${endDate}.csv"`
      );
      res.send(csv);
    } catch (error) {
      logger.error({ error }, "Error exporting audit events");
      res.status(500).json({ error: "Erro interno" });
    }
  },
};
