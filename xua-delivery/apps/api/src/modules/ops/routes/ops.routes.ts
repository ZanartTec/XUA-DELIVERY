import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { rateLimitMiddleware } from "../../../middleware/rate-limit.js";
import { RATE_LIMITS } from "../../../infra/rate-limit/limiter.js";
import { kpiController } from "../controllers/kpi.controller.js";
import { kpiOverviewController } from "../controllers/kpi-overview.controller.js";
import { auditController } from "../controllers/audit.controller.js";
import { opsInventoryReadController } from "../controllers/inventory-read.controller.js";

const router = Router();

router.use(authMiddleware);

const opsRead = rateLimitMiddleware("ops:read", RATE_LIMITS.authenticatedRead, (req) => req.user?.sub ?? req.ip);

// Visão consolidada do painel da OPS (resumo, ranking, séries, funil) — ops somente.
router.get("/kpis/overview", requireRole("ops"), opsRead, kpiOverviewController.get);

// KPIs — distributor_admin vê os próprios, ops vê todos, support visualiza
router.get(
  "/kpis",
  requireRole("distributor_admin", "ops", "support"),
  opsRead,
  kpiController.get
);

// Audit export — ops somente. Export CSV é query pesada (pode varrer todo o
// período pedido) — mesma classe de risco que motivou rate limit em imports
// em massa de outros módulos, por isso categoria própria (heavyRead) em vez
// da leitura padrão de ops.
router.get(
  "/audit/export",
  requireRole("ops"),
  rateLimitMiddleware("ops:audit-export", RATE_LIMITS.heavyRead, (req) => req.user?.sub ?? req.ip),
  auditController.exportCsv
);

// Inventory OPS — leitura global
router.get("/inventory/distributors", requireRole("ops"), opsRead, opsInventoryReadController.listDistributors);
router.get("/inventory/items", requireRole("ops"), opsRead, opsInventoryReadController.listItems);
router.get("/inventory/balances", requireRole("ops"), opsRead, opsInventoryReadController.listBalances);
router.get("/inventory/balances/:id", requireRole("ops"), opsRead, opsInventoryReadController.getBalance);
router.get("/inventory/movements", requireRole("ops"), opsRead, opsInventoryReadController.listMovements);
router.get("/inventory/movements/:id", requireRole("ops"), opsRead, opsInventoryReadController.getMovement);
router.get(
  "/inventory/reconciliation-sessions",
  requireRole("ops"),
  opsRead,
  opsInventoryReadController.listReconciliationSessions
);
router.get(
  "/inventory/reconciliation-sessions/:id",
  requireRole("ops"),
  opsRead,
  opsInventoryReadController.getReconciliationSession
);

export { router as opsRoutes };
