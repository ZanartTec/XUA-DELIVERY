import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import type { JwtPayload } from "@xua/shared/types";
import { isUserRole } from "@xua/shared/constants/roles";
import type { UserRole } from "@xua/shared/constants/roles";

function validateJwtSecret(raw: string | undefined): string {
  if (!raw) {
    throw new Error(
      "FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar."
    );
  }

  const normalized = raw.trim();
  if (normalized.length < 32) {
    throw new Error(
      "FATAL: JWT_SECRET inválido. Use pelo menos 32 caracteres aleatórios antes de iniciar."
    );
  }

  if (normalized.toLowerCase().includes("troque-por-uma-chave-segura")) {
    throw new Error(
      "FATAL: JWT_SECRET está com valor placeholder. Configure um segredo real antes de iniciar."
    );
  }

  return normalized;
}
const JWT_SECRET_RAW = validateJwtSecret(process.env.JWT_SECRET);
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const JWT_ISSUER = "xua-delivery";
const JWT_EXPIRATION = "24h";

export async function signToken(payload: {
  sub: string;
  role: UserRole;
  name: string;
  distributor_id?: string;
}): Promise<string> {
  if (!isUserRole(payload.role)) {
    throw new Error(`signToken: role inválida "${payload.role}"`);
  }
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET);
}

/**
 * Passe curto do socket (tempo real).
 *
 * Em produção o site e a API ficam em domínios diferentes: o cookie de sessão
 * (`httpOnly`, gravado no domínio do site) não chega ao handshake do socket,
 * que vai direto à API. O site pede este passe pela rota autenticada por
 * cookie e o entrega em `auth.token`. Ele vale 60 s, serve só para abrir o
 * socket (o HTTP recusa `typ: "socket"`) e carrega a sessão de origem:
 * `sid`/`siat`/`sexp` = jti/iat/exp da sessão, para que logout, troca de
 * senha e expiração da sessão continuem valendo para a conexão aberta.
 */
export const SOCKET_TICKET_TTL_SECONDS = 60;

export interface SocketTicketPayload extends JwtPayload {
  typ: "socket";
  sid: string;
  siat: number;
  sexp: number;
}

export async function signSocketTicket(session: JwtPayload): Promise<{ ticket: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + SOCKET_TICKET_TTL_SECONDS;
  const ticket = await new SignJWT({
    sub: session.sub,
    role: session.role,
    name: session.name,
    ...(session.distributor_id ? { distributor_id: session.distributor_id } : {}),
    typ: "socket",
    sid: session.jti,
    siat: session.iat,
    sexp: session.exp,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET);
  return { ticket, expiresAt };
}

export function isSocketTicket(payload: JwtPayload): payload is SocketTicketPayload {
  return (payload as Partial<SocketTicketPayload>).typ === "socket";
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  });

  if (!isUserRole(payload.role as string)) {
    throw new Error(`verifyToken: token contém role inválida "${payload.role}"`);
  }

  return payload as unknown as JwtPayload;
}


