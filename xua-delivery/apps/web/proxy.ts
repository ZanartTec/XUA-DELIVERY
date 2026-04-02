import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error("FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// Rotas públicas que não requerem autenticação
const PUBLIC_PATHS = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/auth/check-blacklist", "/api/payments/webhook"];
const AUTHENTICATED_API_PATHS = ["/api/auth/me", "/api/auth/logout"];

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

// Rotas de API permitidas por role (RBAC — SEC-02)
const API_ROLE_ROUTES: Record<string, string[]> = {
  consumer: ["/api/orders", "/api/consumers", "/api/subscriptions", "/api/zones", "/api/notifications", "/api/products"],
  distributor_admin: ["/api/orders", "/api/reconciliations", "/api/zones"],
  operator: ["/api/driver", "/api/orders"],
  driver: ["/api/driver", "/api/orders"],
  support: ["/api/orders", "/api/ops"],
  ops: ["/api/orders", "/api/ops", "/api/reconciliations", "/api/zones", "/api/audit"],
};

/**
 * Verifica blacklist de JWT via fetch interno ao Route Handler.
 * Necessário porque proxy Next.js roda no Edge e não pode usar Redis diretamente.
 */
async function checkBlacklist(jti: string, request: NextRequest): Promise<boolean> {
  try {
    const url = new URL("/api/auth/check-blacklist", request.url);
    url.searchParams.set("jti", jti);
    const res = await fetch(url, {
      headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "" },
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body.blacklisted === true;
  } catch {
    // Se falhar, permite o request para não bloquear em caso de Redis down
    return false;
  }
}

export async function proxy(request: NextRequest) {
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
    const userName = typeof payload.name === "string" ? payload.name : "";

    // SEC-01: Verifica se o JWT foi invalidado (logout)
    if (payload.jti) {
      const blacklisted = await checkBlacklist(payload.jti as string, request);
      if (blacklisted) {
        if (pathname.startsWith("/api")) {
          return NextResponse.json({ error: "Token revogado" }, { status: 401 });
        }
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

    // RBAC para API routes (SEC-02)
    if (pathname.startsWith("/api")) {
      if (AUTHENTICATED_API_PATHS.some((route) => pathname.startsWith(route))) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-user-id", payload.sub as string);
        requestHeaders.set("x-user-role", role);
        requestHeaders.set("x-user-name", userName);

        return NextResponse.next({
          request: { headers: requestHeaders },
        });
      }

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
    requestHeaders.set("x-user-name", userName);

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
    // Protege tudo exceto assets estáticos, _next e arquivos PWA (sw.js, manifest.json)
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
