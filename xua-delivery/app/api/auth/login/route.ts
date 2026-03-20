import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/src/schemas/auth";
import { comparePassword, signToken } from "@/src/lib/auth";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const consumer = await db(TABLES.CONSUMERS)
    .where({ email })
    .select("id", "name", "email", "phone", "role", "password_hash")
    .first();

  if (!consumer) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const valid = await comparePassword(password, consumer.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const token = await signToken({
    sub: consumer.id,
    role: consumer.role ?? "consumer",
    name: consumer.name,
  });

  const { password_hash: _, ...user } = consumer;

  const response = NextResponse.json({ user });
  // SEC-10: maxAge alinhado com TTL do JWT (24h)
  response.cookies.set("xua-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return response;
}
