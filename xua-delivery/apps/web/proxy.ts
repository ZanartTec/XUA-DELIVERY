import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error("FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// Rotas públicas que não requerem autenticação
const PUBLIC_PATHS = ["/login", "/register"];

// Mapa de redirecionamento por role (seção 3.2 do guia técnico)
const ROLE_REDIRECTS: Record<string, string> = {
  consumer: "/catalog",
  distributor_admin: "/distributor/queue",
  operator: "/driver/deliveries",
  driver: "/driver/deliveries",
  ops: "/ops/kpis",
  support: "/support",
};

// Rotas de páginas permitidas por role (RBAC)
const ROLE_ROUTES: Record<string, string[]> = {
  consumer: ["/catalog", "/cart", "/checkout", "/orders", "/subscription", "/profile"],
  distributor_admin: ["/distributor"],
  operator: ["/driver"],
  driver: ["/driver"],
  support: ["/support", "/ops/otp-override"],
  ops: ["/ops", "/support"],
};

/**
 * Verifica blacklist de JWT chamando a API externa diretamente.
 */
async function checkBlacklist(jti: string): Promise<boolean> {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:4000";
    const url = new URL("/api/auth/check-blacklist", apiUrl);
    url.searchParams.set("jti", jti);
    const res = await fetch(url, {
      headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "" },
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body.blacklisted === true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API requests passam direto — auth/RBAC são tratados pela API Express
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Rotas públicas passam direto
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Lê token do cookie httpOnly
  const token = request.cookies.get("xua-token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = payload.role as string;

    // SEC-01: Verifica se o JWT foi invalidado (logout)
    if (payload.jti) {
      const blacklisted = await checkBlacklist(payload.jti as string);
      if (blacklisted) {
        const response = NextResponse.redirect(new URL("/login", request.url));
        response.cookies.delete("xua-token");
        return response;
      }
    }

    // Se acessando a raiz, redireciona para a home da role
    if (pathname === "/") {
      const redirectPath = ROLE_REDIRECTS[role] || "/login";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // RBAC para páginas
    const allowedRoutes = ROLE_ROUTES[role];
    if (allowedRoutes) {
      const hasAccess = allowedRoutes.some((route) => pathname.startsWith(route));
      if (!hasAccess) {
        const redirectPath = ROLE_REDIRECTS[role] || "/login";
        return NextResponse.redirect(new URL(redirectPath, request.url));
      }
    }

    // Injeta dados do token nos headers para Server Components
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub as string);
    requestHeaders.set("x-user-role", role);
    requestHeaders.set("x-user-name", typeof payload.name === "string" ? payload.name : "");

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    // Token inválido ou expirado
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("xua-token");
    return response;
  }
}

export const config = {
  matcher: [
    // Protege tudo exceto assets estáticos, _next e arquivos PWA (sw.js, manifest.json)
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
