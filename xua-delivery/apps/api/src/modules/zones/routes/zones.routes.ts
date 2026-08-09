import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { zonesController } from "../controllers/zones.controller.js";

const router = Router();

router.use(authMiddleware);

// Leitura: consumer, distributor_admin, ops
router.get("/", requireRole("consumer", "distributor_admin", "ops"), zonesController.list);
// Painel de operação — inclui zonas inativas. Precede "/:id/*" por ser literal.
router.get("/all", requireRole("distributor_admin", "ops"), zonesController.listForOps);
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
// Transferir zona entre distribuidoras muda o roteamento de todos os endereços
// já vinculados — decisão de operação, exclusiva de ops.
router.patch("/:id/transfer", requireRole("ops"), zonesController.transfer);

// Coverage: distributor_admin, ops
router.get(
  "/:id/coverage",
  requireRole("distributor_admin", "ops"),
  zonesController.listCoverage,
);
router.post("/:id/coverage", requireRole("distributor_admin", "ops"), zonesController.addCoverage);
router.post(
  "/:id/coverage/bulk",
  requireRole("distributor_admin", "ops"),
  rateLimitMiddleware(
    "zones:coverage-bulk",
    RATE_LIMITS.bulkImport,
    (req) => req.user?.sub ?? req.ip,
  ),
  zonesController.addCoverageBulk,
);
router.post(
  "/:id/coverage/preview",
  requireRole("distributor_admin", "ops"),
  rateLimitMiddleware(
    "zones:coverage-bulk",
    RATE_LIMITS.bulkImport,
    (req) => req.user?.sub ?? req.ip,
  ),
  zonesController.previewCoverage,
);
router.delete("/:id/coverage", requireRole("distributor_admin", "ops"), zonesController.removeCoverage);

export { router as zonesRoutes };
