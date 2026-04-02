import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { productsController } from "./products.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", productsController.list);

export { router as productsRoutes };
