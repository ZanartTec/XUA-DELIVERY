import { Router, type Request } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authMiddleware } from "../../../middleware/auth.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";

const router = Router();

// Chaveado por IP + e-mail informado: um IP sozinho não barra credential
// stuffing distribuído contra UMA conta, e um e-mail sozinho não barra um
// atacante testando muitos e-mails do mesmo IP — os dois juntos cobrem os
// dois vetores sem punir todo o IP por causa de uma conta isolada.
function loginAttemptKey(req: Request): string {
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "unknown";
  return `${req.ip ?? "unknown-ip"}:${email}`;
}

// Rotas públicas (não requerem autenticação).
// RATE_LIMITS.auth existia desde antes desta mudança mas nunca era referenciado
// em rota nenhuma — login/register ficavam sem qualquer limite de tentativas.
router.post(
  "/login",
  rateLimitMiddleware("auth:login", RATE_LIMITS.auth, loginAttemptKey),
  authController.login
);
router.post(
  "/register",
  rateLimitMiddleware("auth:register", RATE_LIMITS.auth, loginAttemptKey),
  authController.register
);
router.get("/check-blacklist", authController.checkBlacklist);

// Esqueci a senha — rate limit por IP para evitar abuso/e-mail bombing.
router.post(
  "/forgot-password",
  rateLimitMiddleware("auth:forgot-password", RATE_LIMITS.passwordReset),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  rateLimitMiddleware("auth:reset-password", RATE_LIMITS.passwordReset),
  authController.resetPassword
);

// Rotas autenticadas
router.post("/logout", authController.logout); // Pode funcionar sem auth para limpar cookie
router.get("/me", authMiddleware, authController.me);

export default router;
