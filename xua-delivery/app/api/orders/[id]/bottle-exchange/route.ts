import { NextRequest, NextResponse } from "next/server";
import { bottleExchangeSchema } from "@/src/schemas/order";
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

  const parsed = bottleExchangeSchema.safeParse(body);
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

  // SEC-05: Apenas o motorista do pedido pode registrar troca
  if (order.driver_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: {
        returned_empty_qty: parsed.data.returned_empty_qty,
        bottle_condition: parsed.data.bottle_condition,
      },
    });

    // SEC-09: eventType corrigido para BOTTLE_EXCHANGE_RECORDED
    await auditRepository.emit(
      {
        eventType: AuditEventType.BOTTLE_EXCHANGE_RECORDED,
        actor: { type: ActorType.DRIVER, id: userId! },
        orderId: id,
        sourceApp: SourceApp.DRIVER_WEB,
        payload: {
          returned_empty_qty: parsed.data.returned_empty_qty,
          bottle_condition: parsed.data.bottle_condition,
        },
      },
      tx
    );
  });

  return NextResponse.json({ ok: true });
}
