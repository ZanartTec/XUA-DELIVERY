import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { categoriesController } from "../controllers/categories.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", categoriesController.list);

export { router as categoriesRoutes };
