import { NextRequest, NextResponse } from "next/server";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";
import { verifyToken } from "@/src/lib/auth";
import { z } from "zod";

const createSubscriptionSchema = z.object({
  qty_20l: z.number().int().min(1),
  weekday: z.number().int().min(0).max(6),
  window: z.enum(["morning", "afternoon"]),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get("xua-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const subscriptions = await db(TABLES.SUBSCRIPTIONS)
    .where({ consumer_id: payload.sub })
    .orderBy("created_at", "desc");

  return NextResponse.json(subscriptions);
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

  const body = await req.json();
  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const [subscription] = await db(TABLES.SUBSCRIPTIONS)
    .insert({
      consumer_id: payload.sub,
      qty_20l: parsed.data.qty_20l,
      weekday: parsed.data.weekday,
      window: parsed.data.window,
      status: "active",
    })
    .returning("*");

  return NextResponse.json(subscription, { status: 201 });
}
