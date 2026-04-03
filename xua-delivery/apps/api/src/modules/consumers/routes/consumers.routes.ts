import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireRole } from "../../../middleware/rbac.js";
import { consumersController } from "../controllers/consumers.controller.js";

const router = Router();

// Todas as rotas de consumer exigem autenticação
router.use(authMiddleware);
router.use(requireRole("consumer"));

// CEP lookup (antes das rotas :id para não conflitar)
router.get("/cep/:cep", consumersController.lookupCep);

// Profile
router.get("/:id", consumersController.getProfile);
router.patch("/:id", consumersController.updateProfile);

// Deposit preview
router.get("/:id/deposit-preview", consumersController.depositPreview);

// Addresses
router.get("/:id/addresses", consumersController.listAddresses);
router.post("/:id/addresses", consumersController.createAddress);

export { router as consumersRoutes };
