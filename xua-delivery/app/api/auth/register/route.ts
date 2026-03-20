import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/src/schemas/auth";
import { hashPassword, signToken } from "@/src/lib/auth";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, phone, password } = parsed.data;

  const existing = await db(TABLES.CONSUMERS).where({ email }).first();
  if (existing) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
  }

  const password_hash = await hashPassword(password);

  // SEC-07: Retorna apenas colunas seguras (sem password_hash)
  const [consumer] = await db(TABLES.CONSUMERS)
    .insert({ name, email, phone, password_hash })
    .returning(["id", "name", "email", "phone", "role"]);

  const token = await signToken({
    sub: consumer.id,
    role: consumer.role ?? "consumer",
    name: consumer.name,
  });

  const response = NextResponse.json({ user: consumer }, { status: 201 });
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
