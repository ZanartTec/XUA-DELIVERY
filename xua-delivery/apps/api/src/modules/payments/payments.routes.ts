import { Router } from "express";
import { paymentsController } from "./payments.controller.js";

const router = Router();

// Webhook é público — autenticação via HMAC, não via JWT
router.post("/webhook", paymentsController.webhook);

export { router as paymentsRoutes };
