import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { verifyToken } from "@/src/lib/auth";
import { DeliveryWindow, SubscriptionStatus } from "@/src/types/enums";
import { z } from "zod";

const createSubscriptionSchema = z.object({
  qty_20l: z.number().int().min(1),
  weekday: z.number().int().min(0).max(6),
  window: z.nativeEnum(DeliveryWindow),
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

  const subscriptions = await prisma.subscription.findMany({
    where: { consumer_id: payload.sub },
    orderBy: { created_at: "desc" },
  });

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

  const subscription = await prisma.subscription.create({
    data: {
      consumer_id: payload.sub,
      qty_20l: parsed.data.qty_20l,
      weekday: parsed.data.weekday,
      delivery_window: parsed.data.window,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  return NextResponse.json(subscription, { status: 201 });
}
