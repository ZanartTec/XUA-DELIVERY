import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { subscriptionPlansController } from "../controllers/subscription-plans.controller.js";

const router = Router();

const planRead = rateLimitMiddleware(
  "subscription-plans:read",
  RATE_LIMITS.authenticatedRead,
  (req) => req.user?.sub ?? req.ip
);
const planWrite = rateLimitMiddleware(
  "subscription-plans:write",
  RATE_LIMITS.authenticatedWrite,
  (req) => req.user?.sub ?? req.ip
);

// GET /api/subscription-plans — público autenticado (consumers, ops, etc.)
router.get("/", authMiddleware, planRead, subscriptionPlansController.list);
router.get("/:id", authMiddleware, planRead, subscriptionPlansController.getOne);

// Mutações: apenas ops
router.post("/", authMiddleware, requireRole("ops"), planWrite, subscriptionPlansController.create);
router.patch("/:id", authMiddleware, requireRole("ops"), planWrite, subscriptionPlansController.update);

export { router as subscriptionPlansRoutes };
