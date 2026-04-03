import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@xua/shared/constants/roles";

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
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    next();
  };
}

// Rotas de API permitidas por role (SEC-02)
// Usado internamente para validação granular se necessário
export const API_ROLE_ROUTES: Record<UserRole, string[]> = {
  consumer: [
    "/api/orders",
    "/api/consumers",
    "/api/subscriptions",
    "/api/zones",
    "/api/notifications",
    "/api/products",
  ],
  distributor_admin: ["/api/orders", "/api/reconciliations", "/api/zones"],
  driver: ["/api/driver", "/api/orders"],
  support: ["/api/orders", "/api/ops"],
  ops: [
    "/api/orders",
    "/api/ops",
    "/api/reconciliations",
    "/api/zones",
    "/api/audit",
  ],
};
