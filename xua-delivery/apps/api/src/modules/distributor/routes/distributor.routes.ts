import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { distributorController } from "../controllers/distributor.controller.js";
import { paymentSettingsController } from "../controllers/payment-settings.controller.js";
import { depositController } from "../../deposits/index.js";

const router = Router();

router.use(authMiddleware);

// ─── Programa de caução de vasilhames ─────────────────────
router.get(
  "/deposit-program/lookup",
  requireRole("distributor_admin", "ops"),
  depositController.lookup,
);
router.get(
  "/deposit-program",
  requireRole("distributor_admin", "ops"),
  depositController.listPrograms,
);
router.post(
  "/deposit-program",
  requireRole("distributor_admin", "ops"),
  depositController.enroll,
);
router.patch(
  "/deposit-program/:consumerId",
  requireRole("distributor_admin", "ops"),
  depositController.patch,
);
router.get(
  "/deposit/balances",
  requireRole("distributor_admin", "ops"),
  depositController.listBalances,
);
router.post(
  "/deposit/:consumerId/adjust",
  requireRole("distributor_admin", "ops"),
  depositController.adjust,
);

// ─── Config de pagamento (métodos aceitos + gateway MP) ───
router.get(
  "/payment-settings/:distributorId",
  requireRole("distributor_admin", "ops"),
  paymentSettingsController.get,
);
router.patch(
  "/payment-settings/:distributorId",
  requireRole("distributor_admin", "ops"),
  paymentSettingsController.update,
);

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

// ─── CRUD de distribuidora (ops) ───────────────────────────
router.post("/", requireRole("ops"), distributorController.create);
router.patch("/:id", requireRole("ops"), distributorController.update);

// ─── CRUD de motorista (distributor_admin, ops) ────────────
// Rotas com 2 segmentos (/drivers, /drivers/:id, /drivers/unlinked,
// /drivers/:id/link) não colidem com o /:id de 1 segmento acima.
router.post("/drivers", requireRole("distributor_admin", "ops"), distributorController.createDriver);
router.patch("/drivers/:id", requireRole("distributor_admin", "ops"), distributorController.updateDriver);
router.get("/drivers/unlinked", requireRole("ops"), distributorController.listUnlinkedDrivers);
router.patch("/drivers/:id/link", requireRole("ops"), distributorController.linkDriver);

export { router as distributorRoutes };
