import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { notificationsController } from "../controllers/notifications.controller.js";

const router = Router();

router.use(authMiddleware);

router.post(
  "/subscribe",
  requireRole("consumer", "distributor_admin", "driver", "ops", "support"),
  notificationsController.subscribe
);

router.delete(
  "/subscribe",
  requireRole("consumer", "distributor_admin", "driver", "ops", "support"),
  notificationsController.unsubscribe
);

export { router as notificationsRoutes };
