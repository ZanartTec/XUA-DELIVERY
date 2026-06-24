import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { bannersController } from "../controllers/banners.controller.js";

const router = Router();

router.use(authMiddleware);

// Consumer: listar banners ativos
router.get(
  "/",
  requireRole("consumer", "ops", "distributor_admin"),
  rateLimitMiddleware("catalog:read", RATE_LIMITS.catalogRead, (req) => req.user?.sub ?? req.ip),
  bannersController.list
);

// Ops: listar todos (inclusive inativos)
router.get("/all", requireRole("ops"), bannersController.listAll);

// Ops: CRUD
router.post("/", requireRole("ops"), bannersController.create);
router.patch("/:id", requireRole("ops"), bannersController.update);
router.delete("/:id", requireRole("ops"), bannersController.remove);

export { router as bannersRoutes };
