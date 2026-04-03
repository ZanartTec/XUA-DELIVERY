import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { distributorController } from "../controllers/distributor.controller.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRole("distributor_admin"));

// KPIs do distribuidor autenticado
router.get("/kpis", distributorController.getKpis);

// Disponibilidade de capacidade por zone/período
router.get("/capacity", distributorController.getCapacity);

export { router as distributorRoutes };
