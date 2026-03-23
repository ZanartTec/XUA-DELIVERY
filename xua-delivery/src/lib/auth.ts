import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { randomUUID } from "crypto";
import type { JwtPayload } from "@/src/types";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error("FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar.");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const JWT_ISSUER = "xua-delivery";
const JWT_EXPIRATION = "24h";

export async function signToken(payload: {
  sub: string;
  role: string;
  name: string;
}): Promise<string> {
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
  return payload as unknown as JwtPayload;
}

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return compare(password, passwordHash);
}
