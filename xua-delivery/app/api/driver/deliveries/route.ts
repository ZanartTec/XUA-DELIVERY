import { NextRequest, NextResponse } from "next/server";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";
import { verifyToken } from "@/src/lib/auth";

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

  const deliveries = await db(TABLES.ORDERS)
    .where({ driver_id: payload.sub })
    .whereIn("status", [
      "dispatched",
      "in_transit",
      "arrived",
      "delivered",
    ])
    .whereRaw("DATE(delivery_date) = ?", [today])
    .leftJoin(TABLES.CONSUMERS, `${TABLES.ORDERS}.consumer_id`, `${TABLES.CONSUMERS}.id`)
    .select(
      `${TABLES.ORDERS}.*`,
      `${TABLES.CONSUMERS}.name as consumer_name`,
      `${TABLES.CONSUMERS}.phone as consumer_phone`
    )
    .orderBy(`${TABLES.ORDERS}.delivery_date`, "asc");

  return NextResponse.json(deliveries);
}
