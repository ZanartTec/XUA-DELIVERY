import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { notificationsController } from "./notifications.controller.js";

const router = Router();

router.use(authMiddleware);

router.post("/subscribe", notificationsController.subscribe);

export { router as notificationsRoutes };
