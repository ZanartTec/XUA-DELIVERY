import { NextRequest, NextResponse } from "next/server";
import { ratingSchema } from "@/src/schemas/order";
import { prisma } from "@/src/lib/prisma";
import { OrderStatus } from "@/src/types/enums";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id");
  const body = await req.json();

  const parsed = ratingSchema.safeParse(body);
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

  // SEC-05: Apenas o consumidor dono do pedido pode avaliar
  if (order.consumer_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  if (order.status !== OrderStatus.DELIVERED) {
    return NextResponse.json({ error: "Avaliação permitida apenas após entrega" }, { status: 400 });
  }

  await prisma.order.update({
    where: { id },
    data: {
      nps_score: parsed.data.rating,
      nps_comment: parsed.data.comment ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
