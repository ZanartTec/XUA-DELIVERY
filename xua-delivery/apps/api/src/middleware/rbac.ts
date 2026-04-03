import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@xua/shared/constants/roles";
import { createLogger } from "../infra/logger";

const log = createLogger("rbac");

/**
 * Middleware factory para RBAC.
 * Verifica se o usuário autenticado possui uma das roles permitidas.
 * Deve ser usado após authMiddleware.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      log.warn({ userId: user.sub, role: user.role, path: req.originalUrl }, "Access denied");
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    next();
  };
}
