import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { zonesController } from "../controllers/zones.controller.js";

const router = Router();

router.use(authMiddleware);

// Leitura: consumer, distributor_admin, ops
router.get("/", requireRole("consumer", "distributor_admin", "ops"), zonesController.list);
router.get("/:id/capacity", requireRole("consumer", "distributor_admin", "ops"), zonesController.getCapacity);
router.get(
  "/:id/available-dates",
  requireRole("consumer", "distributor_admin", "ops"),
  zonesController.getAvailableDates,
);
router.get(
  "/:id/time-slots",
  requireRole("consumer", "distributor_admin", "ops"),
  zonesController.getTimeSlots,
);

// Escrita: distributor_admin, ops
router.post("/", requireRole("distributor_admin", "ops"), zonesController.create);
router.patch("/:id", requireRole("distributor_admin", "ops"), zonesController.update);
router.delete("/:id", requireRole("distributor_admin", "ops"), zonesController.remove);

// Coverage: distributor_admin, ops
router.post("/:id/coverage", requireRole("distributor_admin", "ops"), zonesController.addCoverage);
router.delete("/:id/coverage", requireRole("distributor_admin", "ops"), zonesController.removeCoverage);

export { router as zonesRoutes };
