import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { driverController } from "../controllers/driver.controller.js";

const router = Router();

// Todas as rotas de driver requerem autenticação + role driver
router.use(authMiddleware);
router.use(requireRole("driver"));

/**
 * GET /api/driver/deliveries
 * Lista entregas do dia do motorista.
 */
router.get("/deliveries", driverController.listDeliveries);

/**
 * GET /api/driver/deliveries/pending
 * Lista entregas pendentes (OUT_FOR_DELIVERY).
 */
router.get("/deliveries/pending", driverController.listPendingDeliveries);

/**
 * GET /api/driver/deliveries/history
 * Lista histórico de entregas.
 */
router.get("/deliveries/history", driverController.listDeliveryHistory);

export { router as driverRoutes };
