import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { categoriesController } from "../controllers/categories.controller.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/",
  requireRole("consumer", "ops", "distributor_admin"),
  rateLimitMiddleware("catalog:read", RATE_LIMITS.catalogRead, (req) => req.user?.sub ?? req.ip),
  categoriesController.list
);

export { router as categoriesRoutes };
