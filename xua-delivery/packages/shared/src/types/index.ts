// ─── JWT Payload (contrato manual — não depende de Prisma) ─────────
export interface JwtPayload {
  sub: string;
  role: "consumer" | "distributor_admin" | "driver" | "ops" | "support";
  name: string;
  jti: string;
  iat: number;
  exp: number;
  distributor_id?: string;
}
