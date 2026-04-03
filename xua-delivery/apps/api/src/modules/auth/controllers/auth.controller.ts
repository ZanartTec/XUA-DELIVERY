import type { Request, Response, NextFunction } from "express";
import { loginSchema, registerSchema } from "@xua/shared/schemas/auth";
import { verifyToken } from "../../../infra/auth/jwt.js";
import { isBlacklisted } from "../../../infra/auth/blacklist.js";
import { authService } from "../services/auth.service.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 1000, // 24h em ms
};

export const authController = {
  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { token, user } = await authService.login(parsed.data);

      res.cookie("xua-token", token, COOKIE_OPTIONS);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/register
   */
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { token, user } = await authService.register(parsed.data);

      res.cookie("xua-token", token, COOKIE_OPTIONS);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.["xua-token"];

      if (token) {
        try {
          const payload = await verifyToken(token);
          if (payload.jti && payload.exp) {
            await authService.logout(payload.jti, payload.exp);
          }
        } catch {
          // Token já expirado ou inválido — nada a blacklistar
        }
      }

      res.cookie("xua-token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/me
   * Requer autenticação (authMiddleware deve estar ativo).
   */
  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const consumer = await authService.me(userId);
      res.json({ consumer });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/check-blacklist
   * Endpoint interno para verificar se um JTI está blacklisted.
   * Protegido por INTERNAL_SECRET.
   */
  async checkBlacklist(req: Request, res: Response, next: NextFunction) {
    try {
      const secret = req.headers["x-internal-secret"];
      if (secret !== process.env.INTERNAL_SECRET) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const jti = req.query.jti as string | undefined;
      if (!jti) {
        res.json({ blacklisted: false });
        return;
      }

      const blacklisted = await isBlacklisted(jti);
      res.json({ blacklisted });
    } catch (err) {
      next(err);
    }
  },
};
