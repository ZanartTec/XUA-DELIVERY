import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { auditExportSchema } from "@/src/schemas/ops/audit";
import { withErrorHandling } from "@/src/lib/api-handler";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const role = req.headers.get("x-user-role");
  if (role !== "ops") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const params = {
    startDate: req.nextUrl.searchParams.get("startDate"),
    endDate: req.nextUrl.searchParams.get("endDate"),
    distributorId: req.nextUrl.searchParams.get("distributorId") || undefined,
    eventTypes: req.nextUrl.searchParams.getAll("eventTypes"),
  };

  const parsed = auditExportSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { startDate, endDate, distributorId, eventTypes } = parsed.data;

  const events = await prisma.auditEvent.findMany({
    where: {
      occurred_at: {
        gte: new Date(startDate),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      },
      ...(eventTypes?.length ? { event_type: { in: eventTypes as never[] } } : {}),
      ...(distributorId
        ? {
            order: { distributor_id: distributorId },
          }
        : {}),
    },
    include: {
      order: { select: { id: true, distributor_id: true } },
    },
    orderBy: { occurred_at: "asc" },
  });

  // Gera CSV
  const header = "id,event_type,actor_type,actor_id,order_id,source_app,occurred_at,payload\n";
  const rows = events.map((e) =>
    [
      e.id,
      e.event_type,
      e.actor_type,
      e.actor_id,
      e.order_id || "",
      e.source_app,
      e.occurred_at.toISOString(),
      JSON.stringify(e.payload || {}),
    ].join(",")
  );

  const csv = header + rows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit_${startDate}_${endDate}.csv"`,
    },
  });
});
