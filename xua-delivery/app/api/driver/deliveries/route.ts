import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { verifyToken } from "@/src/lib/auth";
import { OrderStatus } from "@/src/types/enums";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("xua-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  if (payload.role !== "driver") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dayStart = new Date(today + "T00:00:00Z");
  const dayEnd = new Date(today + "T23:59:59.999Z");

  const deliveries = await prisma.order.findMany({
    where: {
      driver_id: payload.sub,
      status: {
        in: [
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DELIVERED,
        ],
      },
      delivery_date: { gte: dayStart, lte: dayEnd },
    },
    include: {
      consumer: {
        select: { name: true, phone: true },
      },
    },
    orderBy: { delivery_date: "asc" },
  });

  const mapped = deliveries.map(({ consumer, ...order }) => ({
    ...order,
    consumer_name: consumer.name,
    consumer_phone: consumer.phone,
  }));

  return NextResponse.json(mapped);
}
