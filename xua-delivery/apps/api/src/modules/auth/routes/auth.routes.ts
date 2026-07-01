import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authMiddleware } from "../../../middleware/auth.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";

const router = Router();

// Rotas públicas (não requerem autenticação)
router.post("/login", authController.login);
router.post("/register", authController.register);
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
