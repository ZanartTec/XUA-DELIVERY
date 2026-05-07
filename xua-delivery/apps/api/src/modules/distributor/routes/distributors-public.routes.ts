import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { distributorController } from "../controllers/distributor.controller.js";

const router = Router();

router.use(authMiddleware);

// GET /api/distributors?zone_id=&date=&window=
// Lista distribuidoras disponíveis para seleção manual pelo consumidor
router.get("/", requireRole("consumer"), distributorController.listAvailable);

// GET /api/distributors/:distributorId/public-schedule
// Weekdays ativos + time slots disponíveis para montar telas do consumer.
router.get(
  "/:distributorId/public-schedule",
  requireRole("consumer"),
  distributorController.getPublicSchedule,
);

export { router as distributorsPublicRoutes };
