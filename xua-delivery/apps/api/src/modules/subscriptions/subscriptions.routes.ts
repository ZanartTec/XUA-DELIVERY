import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { subscriptionsController } from "./subscriptions.controller.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRole("consumer"));

router.get("/", subscriptionsController.list);
router.post("/", subscriptionsController.create);
router.patch("/:id", subscriptionsController.update);

export { router as subscriptionsRoutes };
