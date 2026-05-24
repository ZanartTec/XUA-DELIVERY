import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { userSubscriptionsController } from "../controllers/user-subscriptions.controller.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRole("consumer"));

router.get("/", userSubscriptionsController.list);
router.post("/", userSubscriptionsController.create);
router.post("/:id/payment", userSubscriptionsController.resumePayment);
router.get("/:id", userSubscriptionsController.getOne);
router.patch("/:id/cancel", userSubscriptionsController.cancel);
router.patch("/:id/pause", userSubscriptionsController.pause);
router.patch("/:id/resume", userSubscriptionsController.resume);

export { router as userSubscriptionsRoutes };
