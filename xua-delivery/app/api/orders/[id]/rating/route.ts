import { NextRequest, NextResponse } from "next/server";
import { ratingSchema } from "@/src/schemas/order";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";

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

  const order = await db(TABLES.ORDERS).where({ id }).first();
  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  // SEC-05: Apenas o consumidor dono do pedido pode avaliar
  if (order.consumer_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  if (order.status !== "DELIVERED") {
    return NextResponse.json({ error: "Avaliação permitida apenas após entrega" }, { status: 400 });
  }

  await db(TABLES.ORDERS).where({ id }).update({
    nps_score: parsed.data.rating,
    nps_comment: parsed.data.comment ?? null,
  });

  return NextResponse.json({ ok: true });
}
