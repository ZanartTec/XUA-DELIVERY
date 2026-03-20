import { NextRequest, NextResponse } from "next/server";
import { nonCollectionSchema } from "@/src/schemas/order";
import { prisma } from "@/src/lib/prisma";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id");
  const body = await req.json();

  const parsed = nonCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  // SEC-05: Apenas o motorista do pedido pode registrar não-coleta
  if (order.driver_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: {
        empty_not_collected_reason: parsed.data.reason,
        empty_not_collected_notes: parsed.data.notes ?? null,
      },
    });

    // SEC-09: eventType corrigido para EMPTY_NOT_COLLECTED
    await auditRepository.emit(
      {
        eventType: AuditEventType.EMPTY_NOT_COLLECTED,
        actor: { type: ActorType.DRIVER, id: userId! },
        orderId: id,
        sourceApp: SourceApp.DRIVER_WEB,
        payload: {
          reason: parsed.data.reason,
          notes: parsed.data.notes ?? null,
        },
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
