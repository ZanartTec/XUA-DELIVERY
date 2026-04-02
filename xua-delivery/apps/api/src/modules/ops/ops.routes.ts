import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { kpiController } from "./kpi.controller.js";
import { reconciliationController } from "./reconciliation.controller.js";
import { auditController } from "./audit.controller.js";

const router = Router();

router.use(authMiddleware);

// KPIs — distributor_admin vê os próprios, ops vê todos
router.get(
  "/kpis",
  requireRole("distributor_admin", "ops"),
  kpiController.get
);

// Reconciliação — distributor_admin somente
router.get(
  "/reconciliations",
  requireRole("distributor_admin"),
  reconciliationController.get
);
router.post(
  "/reconciliations",
  requireRole("distributor_admin"),
  reconciliationController.close
);

// Audit export — ops somente
router.get("/audit/export", requireRole("ops"), auditController.exportCsv);

export { router as opsRoutes };
