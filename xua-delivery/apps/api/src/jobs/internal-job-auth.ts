import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../infra/logger/index.js";

/**
 * Middleware de autenticação para endpoints internos de job.
 * Protege com `INTERNAL_JOB_SECRET` via header `Authorization: Bearer <token>`.
 * Usa timing-safe compare para prevenir ataques de timing.
 * Fail-closed: se o segredo não estiver configurado, retorna 503.
 */
export function internalJobAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secret = process.env.INTERNAL_JOB_SECRET;

  if (!secret) {
    logger.error("INTERNAL_JOB_SECRET não configurada — jobs desabilitados");
    res.status(503).json({ error: "Job secret not configured" });
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice(7);

  // Timing-safe compare — previne ataques de timing (OWASP)
  const expected = Buffer.from(secret, "utf-8");
  const received = Buffer.from(token, "utf-8");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
