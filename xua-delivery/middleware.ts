import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error("FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// Rotas públicas que não requerem autenticação
const PUBLIC_PATHS = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/payments/webhook"];

// Mapa de redirecionamento por role (seção 3.2 do guia técnico)
const ROLE_REDIRECTS: Record<string, string> = {
  consumer: "/catalog",
  distributor_admin: "/distributor/queue",
  operator: "/driver/deliveries",
  driver: "/driver/deliveries",
  ops: "/ops/kpis",
  support: "/ops/support",
};

// Rotas de páginas permitidas por role (RBAC)
const ROLE_ROUTES: Record<string, string[]> = {
  consumer: ["/catalog", "/cart", "/checkout", "/orders", "/subscription", "/profile"],
  distributor_admin: ["/distributor"],
  operator: ["/driver"],
  driver: ["/driver"],
  support: ["/ops/support", "/ops/otp-override"],
  ops: ["/ops"],
};

// Rotas de API permitidas por role (RBAC — SEC-02)
const API_ROLE_ROUTES: Record<string, string[]> = {
  consumer: ["/api/orders", "/api/consumers", "/api/subscriptions", "/api/zones"],
  distributor_admin: ["/api/orders", "/api/reconciliations", "/api/zones"],
  operator: ["/api/driver", "/api/orders"],
  driver: ["/api/driver", "/api/orders"],
  support: ["/api/orders", "/api/ops"],
  ops: ["/api/orders", "/api/ops", "/api/reconciliations"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas passam direto
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Lê token do cookie httpOnly
  const token = request.cookies.get("xua-token")?.value;

  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = payload.role as string;

    // Se acessando a raiz, redireciona para a home da role
    if (pathname === "/") {
      const redirectPath = ROLE_REDIRECTS[role] || "/login";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // RBAC para API routes (SEC-02)
    if (pathname.startsWith("/api")) {
      const apiRoutes = API_ROLE_ROUTES[role];
      const apiAccess = apiRoutes?.some((route) => pathname.startsWith(route));
      if (!apiAccess) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
    } else {
      // RBAC para páginas
      const allowedRoutes = ROLE_ROUTES[role];
      if (allowedRoutes) {
        const hasAccess = allowedRoutes.some((route) => pathname.startsWith(route));
        if (!hasAccess) {
          const redirectPath = ROLE_REDIRECTS[role] || "/login";
          return NextResponse.redirect(new URL(redirectPath, request.url));
        }
      }
    }

    // Injeta dados do token nos headers para os Route Handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub as string);
    requestHeaders.set("x-user-role", role);

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    // Token inválido ou expirado
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("xua-token");
    return response;
  }
}

export const config = {
  matcher: [
    // Protege tudo exceto assets estáticos e _next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
