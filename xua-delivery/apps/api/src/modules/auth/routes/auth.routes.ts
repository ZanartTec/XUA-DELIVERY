import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authMiddleware } from "../../../middleware/auth.js";

const router = Router();

// Rotas públicas (não requerem autenticação)
router.post("/login", authController.login);
router.post("/register", authController.register);
router.get("/check-blacklist", authController.checkBlacklist);

// Rotas autenticadas
router.post("/logout", authController.logout); // Pode funcionar sem auth para limpar cookie
router.get("/me", authMiddleware, authController.me);

export default router;
