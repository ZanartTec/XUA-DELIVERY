import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { verifyToken } from "@/src/lib/auth";
import { reconciliationSchema } from "@/src/schemas/order";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp, OrderStatus } from "@/src/types/enums";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("xua-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  if (payload.role !== "distributor_admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const dayStart = new Date(date + "T00:00:00Z");
  const dayEnd = new Date(date + "T23:59:59.999Z");

  const orders = await prisma.order.findMany({
    where: {
      distributor_id: payload.sub,
      delivery_date: { gte: dayStart, lte: dayEnd },
      status: { in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
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
    total_returned: orders.reduce((s, o) => s + (o.returned_empty_qty ?? 0), 0),
    total_deposit_cents: orders.reduce((s, o) => s + (o.deposit_amount_cents ?? 0), 0),
    orders_count: orders.length,
  };

  return NextResponse.json({ orders, summary });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("xua-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  if (payload.role !== "distributor_admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = reconciliationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const item of parsed.data.items) {
      await tx.order.update({
        where: { id: item.order_id },
        data: { returned_empty_qty: item.returned_empty_qty },
      });
    }

    // SEC-09: eventType corrigido para DAILY_RECONCILIATION_CLOSED
    await auditRepository.emit(
      {
        eventType: AuditEventType.DAILY_RECONCILIATION_CLOSED,
        actor: { type: ActorType.DISTRIBUTOR_USER, id: payload.sub },
        orderId: null,
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        payload: { items_count: parsed.data.items.length },
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
