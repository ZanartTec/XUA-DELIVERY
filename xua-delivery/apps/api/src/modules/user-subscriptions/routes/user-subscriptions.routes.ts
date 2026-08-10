import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { userSubscriptionsController } from "../controllers/user-subscriptions.controller.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRole("consumer"));

const subscriptionRead = rateLimitMiddleware(
  "user-subscriptions:read",
  RATE_LIMITS.authenticatedRead,
  (req) => req.user?.sub ?? req.ip
);
const subscriptionWrite = rateLimitMiddleware(
  "user-subscriptions:write",
  RATE_LIMITS.authenticatedWrite,
  (req) => req.user?.sub ?? req.ip
);

router.get("/", subscriptionRead, userSubscriptionsController.list);
router.post("/", subscriptionWrite, userSubscriptionsController.create);
router.post("/:id/payment", subscriptionWrite, userSubscriptionsController.resumePayment);
router.get("/:id", subscriptionRead, userSubscriptionsController.getOne);
router.patch("/:id/pause", subscriptionWrite, userSubscriptionsController.pause);
router.patch("/:id/resume", subscriptionWrite, userSubscriptionsController.resume);
router.patch(
  "/:id/delivery-dates/:deliveryDateId",
  subscriptionWrite,
  userSubscriptionsController.editDeliveryDate
);

export { router as userSubscriptionsRoutes };
