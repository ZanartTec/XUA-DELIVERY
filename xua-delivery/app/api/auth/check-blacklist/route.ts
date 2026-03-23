import { NextRequest, NextResponse } from "next/server";
import { isBlacklisted } from "@/src/lib/jwt-blacklist";

/**
 * Endpoint interno para o middleware (Edge) verificar blacklist JWT via Redis.
 * Protegido por INTERNAL_SECRET para evitar acesso externo.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jti = request.nextUrl.searchParams.get("jti");
  if (!jti) {
    return NextResponse.json({ blacklisted: false });
  }

  const blacklisted = await isBlacklisted(jti);
  return NextResponse.json({ blacklisted });
}
