import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import type { JwtPayload } from "@xua/shared/types";
import { isUserRole } from "@xua/shared/constants/roles";
import type { UserRole } from "@xua/shared/constants/roles";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error(
    "FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar."
  );
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const JWT_ISSUER = "xua-delivery";
const JWT_EXPIRATION = "24h";

export async function signToken(payload: {
  sub: string;
  role: UserRole;
  name: string;
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

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  });

  if (!isUserRole(payload.role as string)) {
    throw new Error(`verifyToken: token contém role inválida "${payload.role}"`);
  }

  return payload as unknown as JwtPayload;
}


