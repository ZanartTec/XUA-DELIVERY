import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { productsController } from "../controllers/products.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", requireRole("consumer", "ops", "distributor_admin"), productsController.list);
router.get("/all", requireRole("ops"), productsController.listAll);
router.post("/", requireRole("ops"), productsController.create);
router.patch("/:id", requireRole("ops"), productsController.update);

export { router as productsRoutes };
