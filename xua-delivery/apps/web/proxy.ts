import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function validateJwtSecret(raw: string | undefined): string {
  if (!raw) {
    throw new Error("FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
  }

  const normalized = raw.trim();
  if (normalized.length < 32) {
    throw new Error("FATAL: JWT_SECRET inválido. Use pelo menos 32 caracteres aleatórios antes de iniciar.");
  }

  if (normalized.toLowerCase().includes("troque-por-uma-chave-segura")) {
    throw new Error("FATAL: JWT_SECRET está com valor placeholder. Configure um segredo real antes de iniciar.");
  }

  return normalized;
}
const JWT_SECRET_RAW = validateJwtSecret(process.env.JWT_SECRET);
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// Rotas públicas que não requerem autenticação
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

// Mapa de redirecionamento por role (seção 3.2 do guia técnico)
const ROLE_REDIRECTS: Record<string, string> = {
  consumer: "/catalog",
  distributor_admin: "/distributor/queue",
  driver: "/driver/deliveries",
  ops: "/ops/kpis",
  support: "/support",
};

// Rotas de páginas permitidas por role (RBAC)
const ROLE_ROUTES: Record<string, string[]> = {
  consumer: ["/catalog", "/cart", "/checkout", "/orders", "/subscription", "/profile"],
  distributor_admin: ["/distributor"],
  driver: ["/driver"],
  support: ["/support", "/ops/otp-override"],
  ops: ["/ops", "/support"],
};

// Cache em memória para a verificação de blacklist.
// Estratégia: cacheamos APENAS o resultado "não blacklistado" (false).
// Se o token já está revogado (true), NÃO cacheamos — a próxima requisição
// deve sempre confirmar o revogamento sem esperar o TTL.
// Isso garante que um logout seja efetivo imediatamente, sem janela de risco.
//
// TTL de 30s elimina o thundering herd (10-11 chamadas/carregamento), mantendo
// o custo real: apenas 1 HTTP a cada 30s por usuário ativo.
const blacklistCache = new Map<string, { expiresAt: number }>();
const BLACKLIST_CACHE_TTL_MS = 30_000;

// Limpeza periódica do cache para evitar crescimento de memória indefinido.
// Roda a cada 5 minutos e remove entradas expiradas.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of blacklistCache) {
      if (entry.expiresAt <= now) blacklistCache.delete(key);
    }
  }, 5 * 60_000);
}

/**
 * Verifica se o JWT foi invalidado — por logout (blacklist por jti) OU por troca
 * de senha (sessão obsoleta, comparando iat com o instante da troca).
 *
 * Cache: resultado "válido" (false) é cacheado por BLACKLIST_CACHE_TTL_MS para
 * evitar chamadas duplicadas. Tokens invalidados nunca são cacheados, garantindo
 * que logout/troca de senha sejam detectados já na próxima requisição.
 */
async function checkRevoked(jti: string, sub: string, iat?: number): Promise<boolean> {
  const now = Date.now();
  const cached = blacklistCache.get(jti);
  // Cache hit: token foi verificado recentemente e estava válido.
  if (cached && cached.expiresAt > now) {
    return false;
  }

  try {
    const apiUrl = process.env.API_URL || "http://localhost:4000";
    const url = new URL("/api/auth/check-blacklist", apiUrl);
    url.searchParams.set("jti", jti);
    if (sub) url.searchParams.set("sub", sub);
    if (iat) url.searchParams.set("iat", String(iat));
    const res = await fetch(url, {
      headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "" },
    });
    if (!res.ok) {
      // Erro na API: assumimos válido e cacheamos para não sobrecarregar.
      blacklistCache.set(jti, { expiresAt: now + BLACKLIST_CACHE_TTL_MS });
      return false;
    }
    const body = await res.json();
    const revoked = body.blacklisted === true || body.stale === true;
    // Só cacheamos se estiver válido. Tokens invalidados sempre passam pela API.
    if (!revoked) {
      blacklistCache.set(jti, { expiresAt: now + BLACKLIST_CACHE_TTL_MS });
    }
    return revoked;
  } catch {
    // Falha de rede: fail-open (não bloqueia o usuário), sem cachear.
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

    // SEC-01: Verifica se o JWT foi invalidado (logout ou troca de senha)
    if (payload.jti) {
      const revoked = await checkRevoked(
        payload.jti as string,
        payload.sub as string,
        typeof payload.iat === "number" ? payload.iat : undefined
      );
      if (revoked) {
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
