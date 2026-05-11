import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { subscriptionPlansController } from "../controllers/subscription-plans.controller.js";

const router = Router();

// GET /api/subscription-plans — público autenticado (consumers, ops, etc.)
router.get("/", authMiddleware, subscriptionPlansController.list);
router.get("/:id", authMiddleware, subscriptionPlansController.getOne);

// Mutações: apenas ops
router.post("/", authMiddleware, requireRole("ops"), subscriptionPlansController.create);
router.patch("/:id", authMiddleware, requireRole("ops"), subscriptionPlansController.update);

export { router as subscriptionPlansRoutes };
