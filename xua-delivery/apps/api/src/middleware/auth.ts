import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../infra/auth/jwt";
import { isBlacklisted } from "../infra/auth/blacklist";
import { logger } from "../infra/logger";
import type { JwtPayload } from "@xua/shared/types";

// Extende o tipo Request do Express para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware de autenticação JWT.
 * Extrai o token do cookie `xua-token`, valida, verifica blacklist e injeta req.user.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.["xua-token"];

  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    const payload = await verifyToken(token);

    // SEC-01: Verifica se o token foi invalidado (logout)
    if (payload.jti) {
      const blacklisted = await isBlacklisted(payload.jti);
      if (blacklisted) {
        res.status(401).json({ error: "Token revogado" });
        return;
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    logger.debug({ err }, "Token inválido ou expirado");
    res.status(401).json({ error: "Token inválido" });
  }
}

/**
 * Middleware que requer autenticação mas não falha — apenas popula req.user se válido.
 * Útil para rotas que funcionam tanto autenticadas quanto não autenticadas.
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.["xua-token"];

  if (!token) {
    next();
    return;
  }

  try {
    const payload = await verifyToken(token);
    if (payload.jti && !(await isBlacklisted(payload.jti))) {
      req.user = payload;
    }
  } catch {
    // Token inválido — segue sem user
  }

  next();
}
