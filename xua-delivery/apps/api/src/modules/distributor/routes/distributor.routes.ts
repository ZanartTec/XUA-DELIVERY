import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { distributorController } from "../controllers/distributor.controller.js";

const router = Router();

router.use(authMiddleware);

// KPIs do distribuidor autenticado
router.get("/kpis", requireRole("distributor_admin"), distributorController.getKpis);

// Lista motoristas disponíveis para despacho
router.get("/drivers", requireRole("distributor_admin"), distributorController.getDrivers);

// Lista saldos materializados da distribuidora autenticada
router.get(
  "/inventory/balances",
  requireRole("distributor_admin"),
  distributorController.listInventoryBalances,
);

// Lista itens de estoque disponíveis para a distribuidora autenticada
router.get(
  "/inventory/items",
  requireRole("distributor_admin"),
  distributorController.listInventoryItems,
);

// Lista movimentos de estoque da distribuidora autenticada
router.get(
  "/inventory/movements",
  requireRole("distributor_admin"),
  distributorController.listInventoryMovements,
);

// Registra carga inicial de estoque da distribuidora autenticada
router.post(
  "/inventory/initial-load",
  requireRole("distributor_admin"),
  distributorController.createInitialInventoryLoad,
);

router.post(
  "/inventory/reconciliation-sessions",
  requireRole("distributor_admin"),
  distributorController.openInventoryReconciliationSession,
);

router.get(
  "/inventory/reconciliation-sessions",
  requireRole("distributor_admin"),
  distributorController.listInventoryReconciliationSessions,
);

router.get(
  "/inventory/reconciliation-sessions/:id",
  requireRole("distributor_admin"),
  distributorController.getInventoryReconciliationSession,
);

router.post(
  "/inventory/reconciliation-sessions/:id/close",
  requireRole("distributor_admin"),
  distributorController.closeInventoryReconciliationSession,
);

// Lista de paradas agrupadas por zona/janela para uma data
router.get("/routes/:id", requireRole("distributor_admin"), distributorController.getRouteById);



// ─── Schedule / Blocked Dates ─────────────────────────────
// Acessível por distributor_admin (para sua própria empresa) e ops
router.get(
  "/schedule/:distributorId",
  requireRole("distributor_admin", "ops"),
  distributorController.getScheduleConfig,
);
router.post(
  "/schedule/:distributorId/weekdays",
  requireRole("distributor_admin", "ops"),
  distributorController.upsertWeekdays,
);
router.post(
  "/schedule/:distributorId/block-date",
  requireRole("distributor_admin", "ops"),
  distributorController.blockDate,
);
router.delete(
  "/schedule/:distributorId/block-date/:date",
  requireRole("distributor_admin", "ops"),
  distributorController.unblockDate,
);

// ─── Time Slots CRUD ──────────────────────────────────────
router.get(
  "/schedule/:distributorId/time-slots",
  requireRole("distributor_admin", "ops"),
  distributorController.listTimeSlots,
);
router.post(
  "/schedule/:distributorId/time-slots",
  requireRole("distributor_admin", "ops"),
  distributorController.upsertTimeSlot,
);
router.patch(
  "/schedule/:distributorId/time-slots/:slotId/toggle",
  requireRole("distributor_admin", "ops"),
  distributorController.toggleTimeSlot,
);
router.delete(
  "/schedule/:distributorId/time-slots/:slotId",
  requireRole("distributor_admin", "ops"),
  distributorController.deleteTimeSlot,
);

// Lista todas as distribuidoras ativas — exclusivo para ops
router.get("/all", requireRole("ops"), distributorController.listAll);

export { router as distributorRoutes };
