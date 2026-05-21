import { Router } from "express";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { authMiddleware } from "../../../middleware/auth.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { requireRole } from "../../../middleware/rbac.js";
import { paymentsController } from "../controllers/payments.controller.js";

const router = Router();

router.post(
  "/charge",
  authMiddleware,
  requireRole("consumer"),
  rateLimitMiddleware("payments:charge", RATE_LIMITS.paymentCharge, (req) => req.user?.sub ?? req.ip),
  paymentsController.charge
);

router.get(
  "/status/:orderId",
  authMiddleware,
  requireRole("consumer"),
  rateLimitMiddleware("payments:status", RATE_LIMITS.paymentStatus, (req) => req.user?.sub ?? req.ip),
  paymentsController.status
);

// Webhook é público — autenticação via assinatura oficial do Mercado Pago, não via JWT
router.post(
  "/webhook",
  rateLimitMiddleware("payments:webhook", RATE_LIMITS.paymentWebhook),
  paymentsController.webhook
);

export { router as paymentsRoutes };
