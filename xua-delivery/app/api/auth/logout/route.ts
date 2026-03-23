import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { blacklistToken } from "@/src/lib/jwt-blacklist";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function POST(request: NextRequest) {
  // Extrai o token e adiciona ao blacklist antes de limpar o cookie
  const token = request.cookies.get("xua-token")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.jti && payload.exp) {
        await blacklistToken(payload.jti, payload.exp);
      }
    } catch {
      // Token já expirado ou inválido — nada a blacklistar
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("xua-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
