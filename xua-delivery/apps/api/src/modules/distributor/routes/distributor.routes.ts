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

// Lista de paradas agrupadas por zona/janela para uma data
router.get("/routes/:id", requireRole("distributor_admin"), distributorController.getRouteById);

// Disponibilidade de capacidade por zone/período
router.get("/capacity", requireRole("distributor_admin"), distributorController.getCapacity);

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

export { router as distributorRoutes };
