import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { kpiController } from "../controllers/kpi.controller.js";
import { kpiOverviewController } from "../controllers/kpi-overview.controller.js";
import { auditController } from "../controllers/audit.controller.js";
import { opsInventoryReadController } from "../controllers/inventory-read.controller.js";

const router = Router();

router.use(authMiddleware);

// Visão consolidada do painel da OPS (resumo, ranking, séries, funil) — ops somente.
router.get("/kpis/overview", requireRole("ops"), kpiOverviewController.get);

// KPIs — distributor_admin vê os próprios, ops vê todos, support visualiza
router.get(
  "/kpis",
  requireRole("distributor_admin", "ops", "support"),
  kpiController.get
);

// Audit export — ops somente
router.get("/audit/export", requireRole("ops"), auditController.exportCsv);

// Inventory OPS — leitura global
router.get("/inventory/distributors", requireRole("ops"), opsInventoryReadController.listDistributors);
router.get("/inventory/items", requireRole("ops"), opsInventoryReadController.listItems);
router.get("/inventory/balances", requireRole("ops"), opsInventoryReadController.listBalances);
router.get("/inventory/balances/:id", requireRole("ops"), opsInventoryReadController.getBalance);
router.get("/inventory/movements", requireRole("ops"), opsInventoryReadController.listMovements);
router.get("/inventory/movements/:id", requireRole("ops"), opsInventoryReadController.getMovement);
router.get(
  "/inventory/reconciliation-sessions",
  requireRole("ops"),
  opsInventoryReadController.listReconciliationSessions
);
router.get(
  "/inventory/reconciliation-sessions/:id",
  requireRole("ops"),
  opsInventoryReadController.getReconciliationSession
);

export { router as opsRoutes };
